import { Component, OnInit } from '@angular/core';
import { DatabaseService } from 'src/app/core/services/database.service';

@Component({
  selector: 'app-purchase-type',
  templateUrl: './purchase-type.component.html',
  styleUrls: ['./purchase-type.component.scss']
})
export class PurchaseTypeComponent implements OnInit {

  constructor(
    public dbs: DatabaseService
  ) { }

  ngOnInit(): void {
  }

}
