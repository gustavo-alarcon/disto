import { UndoDialogComponent } from './undo-dialog/undo-dialog.component';
import { DatePipe } from '@angular/common';
import { BuyRequestedProduct } from './../../../core/models/buy.model';
import { MatTableDataSource } from '@angular/material/table';
import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Buy } from 'src/app/core/models/buy.model';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { RequestCreateEditComponent } from './request-create-edit/request-create-edit.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatabaseService } from 'src/app/core/services/database.service';
import { Observable, combineLatest, forkJoin, BehaviorSubject } from 'rxjs';
import { switchMap, startWith, map, tap, concatMap, concatAll, take, filter } from 'rxjs/operators';
import { ValidatedDialogComponent } from './validated-dialog/validated-dialog.component';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-logistics-fabric',
  templateUrl: './logistics-fabric.component.html',
  styleUrls: ['./logistics-fabric.component.scss']
})
export class LogisticsFabricComponent implements OnInit {
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
  displayedColumns: string[] = ['name', 'amount', 'date', 'unitPrice', 'totalPrice', 'validate'];

  p: number = 1;

  data_xls: any = []


  constructor(
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
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
            return buy.map((el, i) => {
              return {
                ...el,
                products: this.dbs.getBuyRequestedProducts(el.id).pipe(
                  tap(res => {
                    this.data_xls[i] = {
                      corr: el.correlative,
                      products: res
                    }
                  })
                ),
                onevalidated$: this.dbs.getBuyRequestedProducts(el.id).pipe(
                  map(prod => {
                    return {
                      load: true,
                      edit: prod.reduce((a, b) => a || (b.validatedStatus == 'pendiente' || b.validatedStatus == 'validado'), false)
                    }
                  })
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
              return !search ? buyReq.status == 'por validar' : true
            case 'Pendiente':
              return !search ? buyReq.status == 'pendiente' : true
            case 'Validado':
              return !search ? buyReq.validated == true : (
                buyReq.correlative.toString().padStart(6).includes(String(search)) &&
                buyReq.validated == true
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

  onCreateEditRequest(edit: boolean, request: Request) {
    let dialogRef: MatDialogRef<RequestCreateEditComponent>;
    if (edit == true) {
      dialogRef = this.dialog.open(RequestCreateEditComponent, {
        minWidth: '400px',
        autoFocus: false,
        data: {
          data: request,
          edit: edit
        }
      });
      dialogRef.afterClosed().subscribe(res => {
        switch (res) {
          case true:
            this.snackBar.open('La solicitud fue editada satisfactoriamente', 'Aceptar', { duration: 5000 });
            break;
          case false:
            this.snackBar.open('Ocurrió un error. Por favor, vuelva a intentarlo', 'Aceptar', { duration: 5000 });
            break;
          default:
            break;
        }
      })
    }
    else {
      dialogRef = this.dialog.open(RequestCreateEditComponent, {
        minWidth: '400px',
        data: {
          data: null,
          edit: edit
        }
      });
      dialogRef.afterClosed().subscribe(res => {
        switch (res) {
          case true:
            this.snackBar.open('La solicitud fue creada satisfactoriamente', 'Aceptar', { duration: 5000 });
            break;
          case false:
            this.snackBar.open('Ocurrió un error. Por favor, vuelva a intentarlo', 'Aceptar', { duration: 5000 });
            break;
          default:
            break;
        }
      })
    }
  }

  validated(product: BuyRequestedProduct, isedit: boolean, ind, corr) {
    this.dialog.open(ValidatedDialogComponent, {
      data: {
        item: product,
        edit: isedit,
        correlative: corr
      }
    }).afterClosed().pipe(
      take(1)
    ).subscribe(() => {
      this.panelOpenState[ind] = false
    })
  }


  undoValidated(product: BuyRequestedProduct, ind, corr) {
    this.dialog.open(UndoDialogComponent, {
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

    let headersXlsx: string[] = [
      'Producto',
      'Cantidad',
      'Precio U.C.',
      'Precio T.',
      'Validado',
      'Merma',
      'Retornado',
      'Stock',
      'Observaciones',
      'Fecha de solicitud',
      'Fecha deseada',
    ]

    table_xlsx.push(headersXlsx);

    data.products.forEach(el => {
      const temp = [
        el.productDescription,
        el.quantity,
        "S/." + el.unitPrice.toFixed(2),
        "S/." + (el.quantity * el.unitPrice).toFixed(2),
        el.validated ? this.getXlsDate(el.validatedDate) : "---",
        el.validationData ? el.validationData.mermaStock : "---",
        el.validationData ? el.validationData.returned : "---",
        el.validationData ? (el.quantity - el.validationData.returned - el.validationData.mermaStock) : "---",
        el.validationData ? el.validationData.observations : "---",
        el.requestedDate ? this.getXlsDate(el.requestedDate) : "---",
        el.desiredDate ? this.getXlsDate(el.desiredDate) : "---",
      ];
      table_xlsx.push(temp);
    })

    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(table_xlsx);

    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Solicitudes de Fábrica');

    const name = `Solicitud ${corr}.xlsx`
    XLSX.writeFile(wb, name);
  }

  getXlsDate(date) {
    let dateObj = new Date(1970);
    dateObj.setSeconds(date['seconds'])
    return this.datePipe.transform(dateObj, 'dd/MM/yyyy');
  }
}
