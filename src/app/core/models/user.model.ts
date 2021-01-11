export class User {
  uid: string;
  email: string;
  dni?: number;
  phone?: string;
  photoURL?: string;
  name?: string;
  lastName1?: string;
  lastName2?: string;
  completeName?: string;
  displayName?: string;
  token?: string;
  admin?: boolean;
  seller?: boolean;
  logistic?: boolean;
  accountant?: boolean;
  role?: string;
  lastLogin?: Date;
  contact?: {
    address: string;
    district: {
      delivery: number;
      name: string;
    };
    coord: {
      lat: number;
      lng: number;
    };
    reference: string;
    phone: number;
  };
  salesCount?: number

  constructor() {
    this.uid = '';
    this.email = '';
    this.dni = 0;
    this.phone = '';
    this.photoURL = '';
    this.name = '';
    this.lastName1 = '';
    this.lastName2 = '';
    this.completeName = '';
    this.displayName = '';
    this.token = '';
    this.admin = false;
    this.seller = false;
    this.logistic = false;
    this.accountant = false;
    this.role = null;
    this.lastLogin = new Date();
    this.contact = {
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
    };
    this.salesCount = 0
  }
}