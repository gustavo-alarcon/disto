import { UndoReturnDialogComponent } from './undo-return-dialog/undo-return-dialog.component';
import { DatePipe } from '@angular/common';
import { ValidatedReturnDialogComponent } from './validated-return-dialog/validated-return-dialog.component';
import { startWith, map, switchMap, tap, take } from 'rxjs/operators';
import { DatabaseService } from 'src/app/core/services/database.service';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { FormControl } from '@angular/forms';
import { Buy, BuyRequestedProduct } from 'src/app/core/models/buy.model';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { Component, OnInit } from '@angular/core';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-logistics-returns',
  templateUrl: './logistics-returns.component.html',
  styleUrls: ['./logistics-returns.component.scss']
})
export class LogisticsReturnsComponent implements OnInit {

  buyList$: Observable<Buy[]>
  filter$: Observable<Buy[]>

  loading = new BehaviorSubject<boolean>(true);
  loading$ = this.loading.asObservable();

  loadingUndo: string = 'F'


  statusOptions = [
    "Todos", "Por validar", 'Pendiente', 'Validado'
  ]

  panelOpenState: boolean[] = [];

  dateFormControl: FormControl;
  statusFormControl: FormControl;
  searchFormControl: FormControl;

  dataSource = new MatTableDataSource();
  displayedColumns: string[] = ['name', 'amount', 'date', 'unitPrice', 'totalPrice', 'observations', 'validate'];

  p: number = 1;

  data_xls: any = []

  constructor(
    private dialog: MatDialog,
    private dbs: DatabaseService,
    public datePipe: DatePipe
  ) { }

  ngOnInit(): void {
    this.initForms();
    this.initObservables();
  }

  initForms() {
    const view = this.dbs.getCurrentMonthOfViewDate();

    let beginDate = view.from;
    let endDate = new Date();
    endDate.setHours(23, 59, 59);

    this.dateFormControl = new FormControl({
      begin: beginDate,
      end: endDate
    })

    this.statusFormControl = new FormControl("Todos")
    this.searchFormControl = new FormControl("")

  }

  initObservables() {
    const view = this.dbs.getCurrentMonthOfViewDate();

    let beginDate = view.from;
    let endDate = new Date();
    endDate.setHours(23, 59, 59);

    this.buyList$ = this.dateFormControl.valueChanges.pipe(
      startWith<{ begin: Date, end: Date }>({ begin: beginDate, end: endDate }),
      map(({ begin, end }) => {
        begin.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59);
        return { begin, end }
      }),
      switchMap((res) => {
        return this.dbs.getBuyRequests(res).pipe(
          map(buy => {

            return buy.filter(el => el.returned).map((el, i) => {
              return {
                ...el,
                products: this.dbs.getBuyRequestedProducts(el.id).pipe(
                  map(prod => prod.filter(el => el.returned)),
                  tap(res => {
                    this.data_xls[i] = {
                      corr: el.correlative,
                      products: res
                    }
                  })
                ),
                total$: this.dbs.getBuyRequestedProducts(el.id).pipe(
                  map(prod => prod.filter(el => el.returned).reduce((a, b) => a + (b.unitPrice * b.returnedQuantity), 0))
                ),
                onevalidated$: this.dbs.getBuyRequestedProducts(el.id).pipe(
                  map(prod => prod.filter(el => el.returned).reduce((a, b) => a || b.returnedValidated, false))
                )
              }
            })
          })
        )
      }),
    )

    this.filter$ = combineLatest(this.buyList$,
      this.statusFormControl.valueChanges.pipe<string>(startWith(this.statusFormControl.value)),
      this.searchFormControl.valueChanges.pipe<string>(startWith(this.searchFormControl.value))
    ).pipe(
      map(([buyList, status, search]) => {
        let buyFiltered = buyList.filter(buyReq => {
          switch (status) {
            case "Todos":
              return !search ? buyReq :
                buyReq.correlative.toString().padStart(6).includes(String(search))
            case "Por validar":
              return !search ? buyReq.returnedStatus == 'por validar' : true
            case 'Pendiente':
              return !search ? buyReq.returnedStatus == 'pendiente' : true
            case 'Validado':
              return !search ? buyReq.validated == true : (
                buyReq.correlative.toString().padStart(6).includes(String(search)) &&
                buyReq.returnedValidated == true
              )
          }
        })
        return buyFiltered
      }),
      tap(res => {
        this.loading.next(false)
        res.forEach(el => {
          this.panelOpenState.push(false);
        })
      })
    )
  }

  validated(product: BuyRequestedProduct, ind, corr) {

    this.dialog.open(ValidatedReturnDialogComponent, {
      data: {
        item: product,
        correlative: corr
      }
    }).afterClosed().pipe(
      take(1)
    ).subscribe(() => {
      this.panelOpenState[ind] = false
    })
  }

  undoValidated(product: BuyRequestedProduct, ind, corr) {
    this.dialog.open(UndoReturnDialogComponent, {
      data: {
        item: product,
        correlative: corr
      }
    }).afterClosed().pipe(
      take(1)
    ).subscribe(() => {
      this.panelOpenState[ind] = false
    })


  }

  downloadXls(ind): void {


    let data: { corr: number, products: BuyRequestedProduct[] } = this.data_xls[ind];
    let corr = ("#F000" + data.corr).slice(-4)
    let table_xlsx: any[] = [];

    //console.log(data);

    let headersXlsx: string[] = [
      'Producto',
      'Cantidad',
      'Precio U.C.',
      'Precio T.',
      'Observaciones'
    ]

    table_xlsx.push(headersXlsx);

    data.products.forEach(el => {
      const temp = [
        el.productDescription,
        el.validationData.returned,
        "S/." + el.unitPrice.toFixed(2),
        "S/." + (el.quantity * el.unitPrice).toFixed(2),
        el.validationData ? el.validationData.observations : "---",

      ];
      table_xlsx.push(temp);
    })

    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(table_xlsx);

    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devoluciones de Fábrica');

    const name = `Devolución de solicitud ${corr}.xlsx`
    XLSX.writeFile(wb, name);
  }

  getXlsDate(date) {
    let dateObj = new Date(1970);
    dateObj.setSeconds(date['seconds'])
    return this.datePipe.transform(dateObj, 'dd/MM/yyyy');
  }

}
