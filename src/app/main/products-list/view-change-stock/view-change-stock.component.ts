import { Component, OnInit, Inject, ViewChild } from '@angular/core';
import { DatabaseService } from 'src/app/core/services/database.service';
import { Product } from 'src/app/core/models/product.model';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import * as XLSX from 'xlsx';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-view-change-stock',
  templateUrl: './view-change-stock.component.html',
  styleUrls: ['./view-change-stock.component.scss']
})
export class ViewChangeStockComponent implements OnInit {

  loadingHistory = new BehaviorSubject<boolean>(false);
  loadingHistory$ = this.loadingHistory.asObservable();

  displayedColumns: string[] = ['index', 'date', 'status', 'oldStock', 'newStock'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator, { static: false }) set content(paginator1: MatPaginator) {
    this.dataSource.paginator = paginator1;
  }


  init$: Observable<any>

  constructor(
    private dialogRef: MatDialogRef<ViewChangeStockComponent>,
    private dbs: DatabaseService,
    private datePipe: DatePipe,
    @Inject(MAT_DIALOG_DATA) public data: { data: Product }
  ) { }

  ngOnInit(): void {
    this.init$ = this.dbs.getProductsStockChanges(this.data.data.id).pipe(
      tap((res) => {
        console.log(res);
        this.dataSource.data = res
        this.loadingHistory.next(false)
      })
    )
  }

  downloadXls(): void {
    let mermaTransfer = this.dataSource.data

    let table_xlsx: any[] = [];
    let headersXlsx = [
      'Fecha/hora de movimiento', 'Descripcion',
      'Cant. de:', 'Cant. a:'
    ]

    table_xlsx.push(headersXlsx);

    mermaTransfer.forEach(trans => {
      const temp = [
        this.datePipe.transform(trans['createdAt']['seconds'] * 1000, 'dd/MM/yyyy(hh:mm:ss)'),
        trans['description'],
        trans['oldStock'],
        trans['newStock']
      ];

      table_xlsx.push(temp);
    })

    /* generate worksheet */
    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(table_xlsx);

    /* generate workbook and add the worksheet */
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `historial`);

    /* save to file */
    const name = 'historial_de_producto_' + this.data.data.description + '.xlsx';
    XLSX.writeFile(wb, name);
  }


}
