import { Component, OnInit, AfterViewInit, ViewChild } from "@angular/core";
import { HttpParams } from "@angular/common/http";
import { FormControl, FormGroup } from "@angular/forms";
import { ISegmentMetaData } from "../../../core/types";
import { debounceTime, mergeMap, map, skip } from "rxjs/operators";
import { SegmentService } from "../../../core/services/segment.service";
import { Observable, of, combineLatest, concat } from "rxjs";
import { MatPaginator, PageEvent } from "@angular/material/paginator";
import { Router } from "@angular/router";

@Component({
  selector: "segment-list",
  templateUrl: "./segment-list.component.html",
  styleUrls: ["./segment-list.component.scss"],
})
export class SegmentListComponent implements OnInit, AfterViewInit {
  segmentMetaDataList: ISegmentMetaData[] = [];
  totalCount: number;

  pageIndex = 0;
  readonly pageSize = 15;
  searchValue: string;

  columnList: { label: string; key: string }[] = [
    { label: "Name", key: "name" },
    { label: "User Count", key: "userCount" },
    { label: "Avg Income", key: "avgIncome" },
    { label: "Dominant Gender", key: "topGender" },
  ];

  dataLoaded = false;

  form: FormGroup = new FormGroup({
    search: new FormControl(""),
  });

  @ViewChild(MatPaginator) paginator: MatPaginator;

  constructor(private segmentService: SegmentService, private router: Router) {}

  ngOnInit(): void {
    this.fetchSegments()
      .subscribe(
        (response) => {
          if (this.dataLoaded) {
            return;
          }
          this.dataLoaded = true;
          this.handleListResponse(response);
        },
        (error) => {
          console.log(`error fetching list ${error}`);
        }
      );
  }

  ngAfterViewInit(): void {
    const pageIndex$ = concat(
      of(0),
      this.paginator.page
          .pipe(map(event => event.pageIndex))
    );
    const searchValue$ = concat(
      of(''),
      this.form.controls["search"].valueChanges
        .pipe(debounceTime(500))
    );

    combineLatest([
      pageIndex$,
      searchValue$
    ])
      .pipe(
        skip(1),
        mergeMap(([pageIndex, searchValue]) => {
          this.pageIndex = pageIndex;
          this.searchValue = searchValue;
          return this.fetchSegments();
        })
      )
      .subscribe(
        (response) => {
          this.dataLoaded = true;
          this.handleListResponse(response);
        },
        (error) => {
          console.log(`error fetching list ${error}`);
        }
      );
  }

  private handleListResponse(response: {
    data: ISegmentMetaData[];
    totalCount: number;
  }): void {
    this.segmentMetaDataList = response.data;
    this.totalCount = response.totalCount;
  }

  fetchSegments(): Observable<{
    data: ISegmentMetaData[];
    totalCount: number;
  }> {
    let params = new HttpParams();

    params = params.set("skip", `${this.pageIndex * this.pageSize}`);
    params = params.set("limit", `${this.pageSize}`);

    if (this.searchValue?.length) {
      params = params.set("q", this.searchValue);
    }
    return this.segmentService.list(params);
  }

  cellClicked(segment: ISegmentMetaData, column: string): void {
    this.router.navigate(["/pages/segments/data", segment._id]);
  }
}
