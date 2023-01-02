import { ObjectId } from "mongodb";
import { Gender } from "./user";

export interface ISegment {
  _id: ObjectId;
  name: string;
}

export interface ISegmentUsersMetaData {
  userCount: number; // the # of users
  avgIncome: number; // the avg yearly income of the user group
  topGender?: Gender; // the dominant gender of the user group
}

export interface ISegmentMetaData extends ISegment, ISegmentUsersMetaData {

}

export interface ISegmentGenderData {
  _id: Gender;
  userCount: number;
  userPercentage: number;
}
