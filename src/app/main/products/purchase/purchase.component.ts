import { SaleDialogComponent } from './../sale-dialog/sale-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { User } from 'src/app/core/models/user.model';
import { AngularFirestore } from '@angular/fire/firestore';
import { Sale, SaleRequestedProducts } from './../../../core/models/sale.model';
import { Ng2ImgMaxService } from 'ng2-img-max';
import { DatabaseService } from 'src/app/core/services/database.service';
import { tap, take, takeLast, map, distinctUntilChanged } from 'rxjs/operators';
import { Observable, BehaviorSubject, forkJoin, combineLatest, observable } from 'rxjs';
import { AuthService } from 'src/app/core/services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Component, OnInit, Input, ViewChild, ElementRef, Renderer2 } from '@angular/core';
import { ScrollDispatcher } from '@angular/cdk/overlay';
import { Router } from '@angular/router';
import { SalesVideoComponent } from '../sales-video/sales-video.component';
import { ExpressUser } from 'src/app/core/models/express-user';

@Component({
  selector: 'app-purchase',
  templateUrl: './purchase.component.html',
  styleUrls: ['./purchase.component.scss']
})
export class PurchaseComponent implements OnInit {
  user: User = null

  firstSale: boolean = true;

  loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();

  loadingbar = new BehaviorSubject<boolean>(true);
  loadingbar$ = this.loadingbar.asObservable();

  userData$: Observable<any>

  init$: Observable<any>

  order: Array<any>

  @ViewChild("scroll", { static: false }) scrollbar: ElementRef;
  scroll$: Observable<any>;

  name: string = ''
  total: number = 0

  firstFormGroup: FormGroup;
  secondFormGroup: FormGroup;
  payFormGroup: FormGroup;

  photosList: Array<any> = []

  payType: Array<any>
  documents: Array<string> = ['Boleta', 'Factura']
  districts: Array<any>

  now: Date

  latitud: number = -12.046301
  longitud: number = -77.031027

  showPhoto: boolean = false
  photos: {
    resizing$: {
      photoURL: Observable<boolean>
    },
    data: File[]
  } = {
      resizing$: {
        photoURL: new BehaviorSubject<boolean>(false)
      },
      data: []
    }

  invoice$: Observable<boolean>;

  constructor(
    private auth: AuthService,
    private snackbar: MatSnackBar,
    public scroll: ScrollDispatcher,
    private renderer: Renderer2,
    private fb: FormBuilder,
    private ng2ImgMax: Ng2ImgMaxService,
    private dialog: MatDialog,
    public dbs: DatabaseService,
    private af: AngularFirestore,
    private router: Router
  ) { }

  ngOnInit(): void {

    if (this.dbs.order.length == 0) {
      this.router.navigateByUrl('main/products/carrito');
    }

    let date = new Date()
    this.now = new Date(date.getTime() + (345600000));

    this.scroll$ = this.scroll.scrolled().pipe(
      tap((data) => {
        const scrollTop = data.getElementRef().nativeElement.scrollTop || 0;
        if (scrollTop >= 120) {
          this.renderer.addClass(this.scrollbar.nativeElement, "shadow");
        } else {
          this.renderer.removeClass(this.scrollbar.nativeElement, "shadow");
        }
      })
    );

    this.init$ = this.dbs.getGeneralConfigDoc().pipe(
      tap(res => {
        this.loadingbar.next(false)
        this.payType = res['payments'].sort((a, b) => {
          const nameA = a.name;
          const nameB = b.name;

          let comparison = 0;
          if (nameA > nameB) {
            comparison = 1;
          } else if (nameA < nameB) {
            comparison = -1;
          }
          return comparison;
        });
        this.districts = res['districts'].sort((a, b) => {
          const nameA = a.name;
          const nameB = b.name;

          let comparison = 0;
          if (nameA > nameB) {
            comparison = 1;
          } else if (nameA < nameB) {
            comparison = -1;
          }
          return comparison;
        });
      })
    )

    this.firstFormGroup = this.fb.group({
      email: [null, [Validators.required, Validators.email]],
      dni: [null, [Validators.required, Validators.minLength(8)]],
      name: [null, [Validators.required]],
      lastname1: [null, [Validators.required]],
      lastname2: [null, [Validators.required]],
      phone: [null, [Validators.required, Validators.minLength(6)]],
    });

    this.secondFormGroup = this.fb.group({
      address: [null, [Validators.required]],
      district: [null, [Validators.required]],
      ref: [null, [Validators.required]]
    });

    this.payFormGroup = this.fb.group({
      pay: [null, [Validators.required]],
      typePay: [null, [Validators.required]],
      photoURL: [null],
      ruc: [null],
      companyName: [null],
      companyAddress: [null]
    });

    this.total = [...this.dbs.order].map(el => this.giveProductPrice(el)).reduce((a, b) => a + b, 0)

    this.order = [...this.dbs.order]

    this.userData$ = this.auth.user$.pipe(
      tap(res => {
        if (res) {
          this.user = res
          if (res["salesCount"]) {
            this.firstSale = false;
          } else {
            this.firstSale = true;
          }

          if (res["contact"]) {
            this.name = res.name.split(" ")[0];
            this.dbs.delivery = res.contact.district.delivery;
          }
          this.getData()
        }
      })
    )

    this.invoice$ =
      this.payFormGroup.get('typePay').valueChanges
        .pipe(
          distinctUntilChanged(),
          map(res => {
            if (res === 'Factura') {
              this.payFormGroup.controls['ruc'].setValidators([Validators.required]);
              this.payFormGroup.controls['companyName'].setValidators([Validators.required]);
              this.payFormGroup.controls['companyAddress'].setValidators([Validators.required]);
              this.payFormGroup.controls['ruc'].updateValueAndValidity();
              this.payFormGroup.controls['companyName'].updateValueAndValidity();
              this.payFormGroup.controls['companyAddress'].updateValueAndValidity();
              return true;
            } else {
              this.payFormGroup.controls['ruc'].clearValidators();
              this.payFormGroup.controls['companyName'].clearValidators();
              this.payFormGroup.controls['companyAddress'].clearValidators();
              this.payFormGroup.controls['ruc'].updateValueAndValidity();
              this.payFormGroup.controls['companyName'].updateValueAndValidity();
              this.payFormGroup.controls['companyAddress'].updateValueAndValidity();
              return false;
            }
          })
        )

  }

  compareDistricts(district) {
    return this.districts.find((el) => el["name"] == district["name"]);
  }

  getData() {
    if (this.user) {
      if (this.user['contact']) {
        this.firstFormGroup = this.fb.group({
          email: [this.user['email'], [Validators.required, Validators.email]],
          dni: [this.user['dni'], [Validators.required, Validators.minLength(8)]],
          name: [this.user['name'], [Validators.required]],
          lastname1: [this.user['lastName1'], [Validators.required]],
          lastname2: [this.user['lastName2'], [Validators.required]],
          phone: [this.user.contact.phone, [Validators.required, Validators.minLength(6)]],
        });

        if (this.districts.find(el => el.name == this.user.contact.district.name)) {
          this.secondFormGroup = this.fb.group({
            address: [this.user.contact.address, [Validators.required]],
            district: [this.user.contact.district, [Validators.required]],
            ref: [this.user.contact.reference, [Validators.required]]
          });
          this.changeDelivery(this.user.contact.district)
        } else {
          this.secondFormGroup = this.fb.group({
            address: [this.user.contact.address, [Validators.required]],
            district: [null, [Validators.required]],
            ref: [this.user.contact.reference, [Validators.required]]
          });
        }

        this.latitud = this.user.contact.coord.lat
        this.longitud = this.user.contact.coord.lng

      } else {
        this.firstSale = true

        this.firstFormGroup = this.fb.group({
          email: [this.user['email'], [Validators.required, Validators.email]],
          dni: [null, [Validators.required, Validators.minLength(8)]],
          name: [this.user['displayName'], [Validators.required]],
          lastname1: [null, [Validators.required]],
          lastname2: [null, [Validators.required]],
          phone: [null, [Validators.required, Validators.minLength(6)]],
        });

        // this.firstFormGroup.get('email').disable()

      }
    }
  }

  giveProductPrice(item) {
    if (item.product.promo) {
      let promTotalQuantity = Math.floor(item.quantity / item.product.promoData.quantity);
      let promTotalPrice = promTotalQuantity * item.product.promoData.promoPrice;
      let noPromTotalQuantity = item.quantity % item.product.promoData.quantity;
      let noPromTotalPrice = noPromTotalQuantity * item.product.price;
      return Number((promTotalPrice + noPromTotalPrice).toFixed(1));
    }
    else {
      return Number((item.quantity * item.product.price).toFixed(1));
    }
  }

  changeDelivery(district) {
    this.dbs.delivery = district['delivery']
  }

  roundNumber(number) {
    return Number(parseFloat(number).toFixed(1));
  }

  eliminatedphoto(ind) {
    this.photosList.splice(ind, 1)
    this.photos.data.splice(ind, 1)

    if (this.photosList.length == 0) {
      this.payFormGroup.get('photoURL').setValue(null);
    }

  }

  compareObjects(o1: any, o2: any): boolean {
    return o1.name === o2.name && o1.delivery === o2.delivery;
  }

  findMe() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((posicion) => {
        this.latitud = posicion.coords.latitude;
        this.longitud = posicion.coords.longitude;

      }, function (error) {
        alert("Tenemos un problema para encontrar tu ubicación");
      });
    }
  }

  mapClicked($event: MouseEvent) {
    this.latitud = $event['coords']['lat'];
    this.longitud = $event['coords']['lng'];
  }

  addNewPhoto(formControlName: string, image: File[]) {
    this.payFormGroup.get(formControlName).setValue(null);
    if (image.length === 0)
      return;
    let reader = new FileReader();
    this.photos.resizing$[formControlName].next(true);

    this.ng2ImgMax.resizeImage(image[0], 10000, 426)
      .pipe(
        take(1)
      ).subscribe(result => {
        this.photos.data.push(new File([result], formControlName + this.photosList.length + result.name.match(/\..*$/)))
        reader.readAsDataURL(image[0]);
        reader.onload = (_event) => {
          this.photosList.push({
            img: reader.result,
            show: false
          })
          this.payFormGroup.get(formControlName).setValue(reader.result);
          this.photos.resizing$[formControlName].next(false);
        }
      },
        error => {
          this.photos.resizing$[formControlName].next(false);
          this.snackbar.open('Por favor, elija una imagen en formato JPG, o PNG', 'Aceptar');
          this.payFormGroup.get(formControlName).setValue(null);

        }
      );
  }

  updateUser(): void {
    if (this.dbs.expressCustomer) return;

    this.user.name = this.firstFormGroup.get('name').value
    this.user.lastName1 = this.firstFormGroup.get('lastname1').value
    this.user.lastName2 = this.firstFormGroup.get('lastname2').value
    this.user.dni = this.firstFormGroup.get('dni').value

    if (!this.user.contact) {
      this.user['contact'] = {
        address: '',
        district: {
          delivery: 0,
          name: ''
        },
        coord: {
          lat: 0,
          lng: 0
        },
        reference: '',
        phone: 0
      }
    }

    this.user.contact.address = this.secondFormGroup.get('address').value
    this.user.contact.phone = this.firstFormGroup.get('phone').value
    this.user.contact.district = this.secondFormGroup.get('district').value
    this.user.contact.reference = this.secondFormGroup.get('ref').value
    this.user.contact.coord.lat = this.latitud
    this.user.contact.coord.lng = this.longitud


  }

  openSale() {
    this.dialog.open(SaleDialogComponent, {
      data: {
        name: this.firstFormGroup.value['name'],
        number: 10,
        email: this.user.email
      }
    })
  }

  prueba() {
    this.updateUser()
    if (this.firstFormGroup.valid && this.secondFormGroup.valid) {
      if (this.payFormGroup.valid) {
        if (!this.payFormGroup.value['photoURL']) {
          this.snackbar.open('Por favor adjunte una imagen de su voucher de pago', 'cerrar')
        } else {
          this.save()
        }
      } else {
        this.snackbar.open('Complete la información del formulario', 'Aceptar', {
          duration: 6000
        });
        this.payFormGroup.markAllAsTouched();
      }
    } else {
      this.snackbar.open('Parece que hubo un problema, complete todos los campos anteriores', 'cerrar')
    }

  }


  save() {
    if (!this.payFormGroup.valid) {
      this.snackbar.open('Complete la información del formulario', 'Aceptar', {
        duration: 6000
      });
      return;
    }

    this.loading.next(true)
    let reduceOrder = this.dbs.getneworder(this.dbs.order)
    this.af.firestore.runTransaction((transaction) => {
      let promises = []
      reduceOrder.forEach((order, ind) => {
        const sfDocRef = this.af.firestore.collection(`/db/distoProductos/productsList`).doc(order.product.id);

        promises.push(transaction.get(sfDocRef).then((prodDoc) => {

          let newStock = prodDoc.data().realStock - order.reduce;
          transaction.update(sfDocRef, { realStock: newStock })

          if (newStock >= prodDoc.data().sellMinimum) {
            return {
              isSave: true,
              product: prodDoc.data().id,
              wrongStock: false,
              newStock: newStock,
              oldStock: prodDoc.data().realStock
            }
          } else {
            return {
              isSave: true,
              product: prodDoc.data().id,
              wrongStock: true,
              newStock: newStock,
              oldStock: prodDoc.data().realStock
            }
          }


        }).catch((error) => {
          console.log("Transaction failed: ", error);
          this.dbs.savePurchaseError(this.dbs.expressCustomer ? this.firstFormGroup.value['name'] + ' ' + this.firstFormGroup.value['lastname1'] : this.user, 'Catch Promised Transaction (Save): ' + error);
          return {
            isSave: false,
            product: order.product.id,
            wrongStock: null,
            newStock: order.product.realStock - order.reduce,
            oldStock: order.product.realStock
          }

        }));


      })
      return Promise.all(promises);
    }).then(res => {
      console.log(res);
      this.savePurchase(res)
    }).catch(error => {
      this.dbs.savePurchaseError(this.dbs.expressCustomer ? this.firstFormGroup.value['name'] + ' ' + this.firstFormGroup.value['lastname1'] : this.user, 'Catch Transaction (Save): ' + error);
      this.snackbar.open('Error de conexión, no se completo la compra, intentelo de nuevo', 'cerrar')
      this.loading.next(false)

    })


  }

  saveStock(list, corr) {
    const batch = this.af.firestore.batch()

    try {
      list.forEach(lt => {
        const editStock = this.af.firestore.collection(`db/distoProductos/productsList/${lt.product}/stockChange`).doc()
        let changeVirtualStock = {
          id: editStock.id,
          description: 'Compra App, venta nº ' + corr,
          createdAt: new Date(),
          createdBy: this.dbs.expressCustomer ?
            this.firstFormGroup.value['name'] + ' ' + this.firstFormGroup.value['lastname1'] :
            this.user.name + ' ' + this.user.lastName1,
          oldStock: lt.oldStock,
          newStock: lt.newStock
        }

        batch.set(editStock, changeVirtualStock)
      })

      batch.commit().then(() => {
        this.dialog.open(SaleDialogComponent, {
          data: {
            name: this.firstFormGroup.value['name'],
            number: corr,
            email: this.dbs.expressCustomer ? this.firstFormGroup.value['email'] : this.user.email
          }
        })

        this.dbs.order = []
        this.dbs.orderObs.next([])
        this.dbs.total = 0
        this.router.navigate(["/main/products"], { fragment: this.dbs.productView });
        //this.dbs.view.next(1)
        this.loading.next(false)
      })
    } catch (error) {
      this.dbs.savePurchaseError(this.dbs.expressCustomer ? { completeName: this.firstFormGroup.value['name'] + ' ' + this.firstFormGroup.value['lastname1'] } : this.user, 'Catch (saveStock): ' +error);
      console.log(error);
    }

  }

  savePurchase(list) {

    if (!this.payFormGroup.valid) {
      this.snackbar.open('Complete la información del formulario', 'Aceptar', {
        duration: 6000
      });
      return;
    }

    const saleCount = this.af.firestore.collection(`/db/distoProductos/config/`).doc('generalConfig');
    const saleRef = this.af.firestore.collection(`/db/distoProductos/sales`).doc();

    let customObject: User = new User();

    customObject.name = this.firstFormGroup.value['name'];
    customObject.lastName1 = this.firstFormGroup.value['lastname1'];
    customObject.lastName2 = this.firstFormGroup.value['lastname2'];
    customObject.email = this.firstFormGroup.value['email'];
    customObject.dni = this.firstFormGroup.value['dni'];

    let expressUser = { ...customObject };

    if (!this.dbs.expressCustomer) this.user.email = this.firstFormGroup.value['email'];

    let newSale: Sale = {
      id: saleRef.id,
      correlative: 0,
      correlativeType: 'R',
      document: this.payFormGroup.get('typePay').value,
      ruc: this.payFormGroup.get('ruc').value,
      companyName: this.payFormGroup.get('companyName').value,
      companyAddress: this.payFormGroup.get('companyAddress').value,
      payType: this.payFormGroup.get('pay').value,
      location: {
        address: this.secondFormGroup.get('address').value,
        district: this.secondFormGroup.get('district').value,
        reference: this.secondFormGroup.get('ref').value,
        coord: {
          lat: this.latitud,
          lng: this.longitud
        },
        phone: this.firstFormGroup.get('phone').value
      },
      requestDate: null,
      createdAt: new Date(),
      createdBy: null,
      user: this.dbs.expressCustomer ? expressUser : this.user,
      requestedProducts: this.dbs.order,
      status: 'Solicitado',
      total: this.total,
      deliveryPrice: this.dbs.delivery,
      voucher: [],
      voucherChecked: false,
      transactionCliente: list,
      allSave: list.reduce((a, b) => a && b.isSave, true)
    }

    let photos = [...this.photos.data.map(el => this.dbs.uploadPhotoVoucher(saleRef.id, el))]

    forkJoin(photos).pipe(
      takeLast(1),
    ).subscribe((res: string[]) => {
      newSale.voucher = [...this.photos.data.map((el, i) => {
        return {
          voucherPhoto: res[i],
          voucherPath: `/sales/vouchers/${saleRef.id}-${el.name}`
        }
      })]

      return this.af.firestore.runTransaction((transaction) => {
        try {
          return transaction.get(saleCount).then((sfDoc) => {

            if (!sfDoc.exists) {
              transaction.set(saleCount, { salesRCounter: 0 });
            }


            //sales
            ////generalCounter
            let newCorr = 1
            if (sfDoc.data().salesRCounter) {
              newCorr = sfDoc.data().salesRCounter + 1;
            }

            transaction.update(saleCount, { salesRCounter: newCorr });

            newSale.correlative = newCorr

            // Passing global values for error catching
            this.dbs.actualSale = newSale

            transaction.set(saleRef, newSale);

            // Expreess customer
            if (!this.dbs.expressCustomer) {
              const email = {
                to: this.user.email,
                template: {
                  name: 'saleEmail'
                }
              }
              const emailRef = this.af.firestore.collection(`/mail`).doc();

              let userCorrelative = 1
              const ref = this.af.firestore.collection(`/users`).doc(this.user.uid);


              if (this.user.salesCount) {
                userCorrelative = this.user.salesCount + 1
              }

              //email
              transaction.set(emailRef, email)
              //user
              transaction.update(ref, {
                contact: newSale.location,
                name: this.firstFormGroup.value['name'],
                lastName1: this.firstFormGroup.value['lastname1'],
                lastName2: this.firstFormGroup.value['lastname2'],
                dni: this.firstFormGroup.value['dni'],
                salesCount: userCorrelative
              })
            }
          })
        } catch (error) {
          console.log(error);
          this.dbs.savePurchaseError(this.dbs.expressCustomer ? expressUser : this.user, 'Catch Get Transaction (SavePurchase): ' + error)
        }

      }).then(() => {
        this.saveStock(list, newSale.correlative)
      }).catch(error => {
        console.log(error);
        this.dbs.savePurchaseError(this.dbs.expressCustomer ? expressUser : this.user, 'Catch Transaction (SAvePurchase): ' + error);
        this.snackbar.open('Error de conexión, no se completo la compra, intentelo de nuevo', 'cerrar')
        this.loading.next(false)
  
      })
    })
  }

  openVideo(): void {
    this.dialog.open(SalesVideoComponent);
  }
}
