import {Request, Response} from "express";
import {handleResponseError} from "../route-handlers/route-error-handler";
import {Collection, FilterQuery, ObjectId} from "mongodb";
import {
  ISegment,
  ISegmentGenderData,
  ISegmentMetaData,
  ISegmentUsersMetaData,
} from "../../common/types/db-models/segment";
import {Gender, IncomeType, IUser} from "../../common/types/db-models/user";
import {getDbWrapper} from "../../common/db/mongo-wrapper";
import escapeStringRegexp from 'escape-string-regexp';
import {maxBy, sum} from 'lodash';

export async function segmentList(req: Request, res: Response): Promise<void> {
  try {

    const skip = parseInt(req.query.skip as string, 10);
    const limit = parseInt(req.query.limit as string, 10);
    const nameSearch = req.query.q as string | undefined;

    // TODO replace by a single big aggregate with lookup (and project) for better performance
    const {segments, totalCount} = await _findSegments(skip, limit, nameSearch);
    const segmentsMetadata = await _lookupSegmentsMetadata(segments);

    res.json({ success: true, data: segmentsMetadata, totalCount });

  } catch (error) {
    handleResponseError(
      `Get Segment List Error: ${error.message}`,
      error.message,
      res
    );
  }
}

export async function getSegmentById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const segmentCollection: Collection = await getDbWrapper().getCollection("segments");
    const segment: ISegment = await segmentCollection.findOne({
      _id: new ObjectId(req.params.id as string),
    });
    if (!segment) {
      return handleResponseError(
        `Error getSegmentById`,
        `Segment with id ${req.params.id} not found.`,
        res
      );
    }
    res.json({ success: true, data: segment });
  } catch (error) {
    handleResponseError(
      `Get Segment by id error: ${error.message}`,
      error.message,
      res
    );
  }
}

export async function updateSegmentById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // res.json({ success: true });
  } catch (error) {
    handleResponseError(
      `Update Segment by id error: ${error.message}`,
      error.message,
      res
    );
  }
}

export async function getSegmentGenderData(
  req: Request,
  res: Response
): Promise<void> {
  try {
    let genderUserCounts = await _getGendersUserCount(req.params.id as string);

    genderUserCounts = genderUserCounts
        .filter(result => result._id === Gender.Male || result._id === Gender.Female);

    const totalUserCount = sum(genderUserCounts.map(result => result.userCount));
    const data: ISegmentGenderData[] = genderUserCounts
        .map(item => {
          return {
            ...item,
            userPercentage: Math.round((item.userCount / totalUserCount) * 1000) / 10
          };
        });

    res.json({ success: true, data });

  } catch (error) {
    handleResponseError(
      `Segment gender data error: ${error.message}`,
      error.message,
      res
    );
  }
}

// TODO move all the bellow to be exported from a separate logic module. We could also write unit tests for them

interface FoundSegments {
  segments: ISegment[];
  totalCount: number;
}

async function _findSegments(skip: number, limit: number, nameSearch?: string): Promise<FoundSegments> {
  const segmentCollection: Collection<ISegment> = await getDbWrapper().getCollection('segments');

  const pipeline: object[] = [];

  if (nameSearch) {
    pipeline.push({
      $match: {
        name: new RegExp(escapeStringRegexp(nameSearch), 'i')
      }
    });
  }

  pipeline.push({
    $facet: {
      segments: [
        { $sort: { _id: -1 } },
        { $skip: skip },
        { $limit: limit }
      ],
      total: [
        { $count: 'count' }
      ]
    }
  });

  const result = await segmentCollection
    .aggregate<{segments: ISegment[], total: [{count: number}]}>(pipeline)
    .next();

  return {
    segments: result.segments,
    totalCount: result.total[0].count
  };
}

async function _getSegmentUsersMetadata(segmentId: string): Promise<ISegmentUsersMetaData> {
  const userCollection: Collection<IUser> = await getDbWrapper().getCollection('users');

  const result = await userCollection
    .aggregate<{
      gendersUserCounts: GenderUserCount[],
      metadata: [UsersMetadata]
    }>([
      _matchSegmentUsersStage(new ObjectId(segmentId)),
      {
        $facet: {
          gendersUserCounts: [
            _genderUserCountStage()
          ],
          metadata: [
            _usersMetadataStage()
          ]
        }
      }
    ])
    .next();

  const gendersUserCounts = result.gendersUserCounts;
  const metadata = result.metadata[0];

  return {
    topGender: _getTopGender(gendersUserCounts),
    userCount: metadata.userCount,
    avgIncome: metadata.avgIncome
  };

}

async function _lookupSegmentsMetadata(segments: ISegment[]): Promise<ISegmentMetaData[]> {
  return await Promise.all(
    segments.map(async segment => {
      const usersMetadata = await _getSegmentUsersMetadata(segment._id.toString());
      return {
        ...segment,
        ...usersMetadata
      };
    })
  );
}

async function _getGendersUserCount(segmentId: string): Promise<GenderUserCount[]> {
  const userCollection: Collection<IUser> = await getDbWrapper().getCollection('users');

  return await userCollection
    .aggregate<GenderUserCount>([
      _matchSegmentUsersStage(new ObjectId(segmentId)),
      _genderUserCountStage()
    ])
    .toArray();
}

function _matchSegmentUsersStage(segmentId: ObjectId): object {
  return {
    $match: {
      $expr: {
        $in: [new ObjectId(segmentId), '$segment_ids']
      }
    }
  };
}

interface GenderUserCount {
  _id: Gender;
  userCount: number;
}

function _getTopGender(gendersUserCounts: GenderUserCount[]): Gender | undefined {
  if (gendersUserCounts.length === 0) {
    return undefined;
  }
  return maxBy(gendersUserCounts, item => item.userCount)._id;
}

function _genderUserCountStage(): object {
  return {
    $group: {
      _id: '$gender',
      userCount: {$sum: 1}
    }
  };
}

interface UsersMetadata {
  _id: null;
  userCount: number;
  avgIncome: number;
}

function _usersMetadataStage(): object {
  return {
    $group: {
      _id: null,
      userCount: {$sum: 1},
      avgIncome: {
        $avg: {
          $cond: {
            if: {$eq: ['$income_type', IncomeType.Monthly]},
            then: {$multiply: ['$income_level', 12]},
            else: '$income_level'
          }
        }
      }
    }
  };
}
