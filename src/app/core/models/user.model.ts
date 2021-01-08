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
    this.uid = null;
    this.email = null;
    this.dni = null;
    this.phone = null;
    this.photoURL = null;
    this.name = null;
    this.lastName1 = null;
    this.lastName2 = null;
    this.completeName = null;
    this.displayName = null;
    this.token = null;
    this.admin = false;
    this.seller = false;
    this.logistic = false;
    this.accountant = false;
    this.role = null;
    this.lastLogin = new Date();
    this.contact = {
      address: null,
      district: {
        delivery: null,
        name: null
      },
      coord: {
        lat: null,
        lng: null
      },
      reference: null,
      phone: null
    };
    this.salesCount = null
  }
}