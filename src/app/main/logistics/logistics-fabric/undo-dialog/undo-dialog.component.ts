import { take, map } from 'rxjs/operators';
import { AngularFirestore } from '@angular/fire/firestore';
import { BuyRequestedProduct } from './../../../../core/models/buy.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatabaseService } from './../../../../core/services/database.service';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Component, OnInit, Inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MermaTransfer } from 'src/app/core/models/product.model';

@Component({
  selector: 'app-undo-dialog',
  templateUrl: './undo-dialog.component.html',
  styleUrls: ['./undo-dialog.component.scss']
})
export class UndoDialogComponent implements OnInit {
  loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();
  constructor(
    private dialogRef: MatDialogRef<UndoDialogComponent>,
    private dbs: DatabaseService,
    private snackBar: MatSnackBar,
    private af: AngularFirestore,
    @Inject(MAT_DIALOG_DATA) public data: { item: BuyRequestedProduct, status: 'string', correlative: number }) { }

  ngOnInit(): void {
  }

  saveUndo() {
    if (this.data.item.validationData.returned > 0) {

      if (this.data.item.returnedStatus == 'por validar') {
        this.undoValidated(this.data.item)
      } else {
        this.deleteDate()
      }
    } else {
      this.undoValidated(this.data.item)
    }
  }

  deleteDate() {
    let order = [...this.data.item.returnedRecord].sort((a, b) => a.date.toMillis() - b.date.toMillis())
    let ind = order.length - 1
    let item = [...order][ind]
    let newDate
    if (order.length == 1) {
      newDate = []
    } else {
      order.pop()
      newDate = order
    }

    this.returnStock(item, newDate)


  }

  returnStock(item, array) {
    this.loading.next(true)
    const requestRef = this.af.firestore.collection(`/db/distoProductos/buys`).doc(this.data.item.buyId);
    const requestProductRef = this.af.firestore.collection(`/db/distoProductos/buys/${this.data.item.buyId}/buyRequestedProducts`).doc(this.data.item.id);
    const editStockRef = this.af.firestore.collection(`db/distoProductos/productsList/${this.data.item.id}/stockChange`).doc()

    const ref = this.af.firestore.collection(`/db/distoProductos/productsList`).doc(this.data.item.id);
    const transferHistoryRef = this.af.firestore.collection(this.dbs.productsListRef + `/${this.data.item.id}/mermaTransfer`).doc();

    this.af.firestore.runTransaction((transaction) => {
      return transaction.get(ref).then((prodDoc) => {
        let newStock = prodDoc.data().realStock - item.quantity
        let newMerma = prodDoc.data().mermaStock - item.merma

        transaction.update(ref, {
          mermaStock: newMerma,
          realStock: newStock
        })

        if (item.merma != 0) {
          let mermaTransferData: MermaTransfer = {
            date: new Date(),
            id: transferHistoryRef.id,
            productId: this.data.item.id,
            quantity: item.merma,
            toMerma: false,
            user: null,
            observations: 'anulado en logistica'
          }
          transaction.set(transferHistoryRef, mermaTransferData)
        }


        transaction.update(requestProductRef, {
          validated: false,
          validatedDate: null,
          validatedStatus: 'pendiente',
          returnedQuantity: this.data.item.returnedQuantity + item.quantity + item.merma,
          returnedStatus: array.length == 0 ? 'por validar' : 'pendiente',
          returnedValidated: false,
          returnedRecord: array,
          returnedDate: new Date()
        })

        transaction.update(requestRef, {
          validated: false,
          validatedDate: null,
          editedDate: null,
          editedBy: null,
          returnedValidated: false,
          returnedDate: null,
          status: 'pendiente',
          returnedStatus: array.length == 0 ? 'por validar' : 'pendiente'
        })

        transaction.set(editStockRef, {
          id: editStockRef.id,
          description: 'anulado en logistica, compra nº ' + this.data.correlative,
          createdAt: new Date(),
          oldStock: prodDoc.data().realStock,
          newStock: newStock
        })

      });
    }).then(() => {
      this.loading.next(false)
      this.dialogRef.close()
      this.snackBar.open(
        'Producto validado',
        'Cerrar',
        { duration: 6000, }
      );

    }).catch(error => {
      this.snackBar.open(
        'Ocurrió un error. Por favor, vuelva a intentarlo.',
        'Cerrar',
        { duration: 6000, }
      );
    })
  }

  undoValidated(product: BuyRequestedProduct) {
    this.loading.next(true)
    const requestRef = this.af.firestore.collection(`/db/distoProductos/buys`).doc(product.buyId);
    const requestProductRef = this.af.firestore.collection(`/db/distoProductos/buys/${product.buyId}/buyRequestedProducts`).doc(product.id);
    const productRef = this.af.firestore.collection(`/db/distoProductos/productsList`).doc(product.id);
    const editStockRef = this.af.firestore.collection(`db/distoProductos/productsList/${product.id}/stockChange`).doc()
    let quantity = product.quantity - (product.validationData.mermaStock + product.validationData.returned)
    const transferHistoryRef = this.af.firestore.collection(this.dbs.productsListRef + `/${this.data.item.id}/mermaTransfer`).doc();

    let returnAll$ = this.dbs.getBuyRequestedProducts(product.buyId).pipe(
      map(products => {
        let prodFilter = products.map(el => {
          let count = 0
          let retValid = true

          if (el.validationData && el.id != product.id) {
            count = el.validationData.returned
            retValid = el.returnedValidated
          }
          return {
            ...el,
            returnedQuantity: count,
            retValid: retValid
          }
        })

        let prodR = products.filter(el => el.validationData).map(el => {
          if (el.id == product.id) {
            el.returned = false
          }
          return el
        })
        return {
          returned: prodR.reduce((a, b) => a || b.returned, false),
          returnedValidated: prodFilter.reduce((a, b) => a || b.retValid, false),
          returnedQuantity: prodFilter.reduce((a, b) => a + b.returnedQuantity, 0)
        }
      }),
      take(1)
    )

    returnAll$.subscribe(res => {
      //console.log(res);

      this.af.firestore.runTransaction((transaction) => {
        return transaction.get(productRef).then((prodDoc) => {
          let newStock = prodDoc.data().realStock - quantity;
          let newMerma = prodDoc.data().mermaStock - product.validationData.mermaStock;

          if (product.validationData.mermaStock != 0) {
            let mermaTransferData: MermaTransfer = {
              date: new Date(),
              id: transferHistoryRef.id,
              productId: this.data.item.id,
              quantity: product.validationData.mermaStock,
              toMerma: false,
              user: null,
              observations: 'anulado en logistica'
            }
            transaction.set(transferHistoryRef, mermaTransferData)
          }

          transaction.update(productRef, {
            realStock: newStock,
            mermaStock: newMerma
          });

          transaction.update(requestRef, {
            validated: false,
            validatedDate: null,
            returned: res.returned,
            returnedQuantity: res.returnedQuantity,
            returnedValidated: res.returnedValidated,
            status: res.returned ? 'pendiente' : 'por validar'
          })

          transaction.update(requestProductRef, {
            validatedStatus: 'por validar',
            validated: false,
            validationData: null,
            returned: false,
            returnedStatus: 'por validar',
            returnRecord: null
          })

          transaction.set(editStockRef, {
            id: editStockRef.id,
            description: 'anulado en logistica, compra nº ' + this.data.correlative,
            createdAt: new Date(),
            oldStock: prodDoc.data().realStock,
            newStock: newStock
          })

        });
      }).then(() => {
        this.dialogRef.close()
        this.snackBar.open(
          'Cambios guardados',
          'Cerrar',
          { duration: 6000, }
        );
        this.loading.next(false)

      }).catch(error => {

        this.snackBar.open(
          'Ocurrió un problema',
          'Cerrar',
          { duration: 6000, }
        );
      });
    })


  }

}
