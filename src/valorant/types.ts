import type { components } from './generated/schema.ts';

type Schemas = components['schemas'];

// Named aliases so call sites read in the API's own vocabulary and the generated
// file stays an implementation detail. Regenerate with `npm run gen:valorant`.

export type Account = Schemas['AccountV2Data'];
export type Mmr = Schemas['MMRV3Data'];
export type MmrHistory = Schemas['MMRHistoryV2Data'];
export type Match = Schemas['MatchesV4Data'];
export type StoredMatch = Schemas['StoredMatch'];
export type StoredMmr = Schemas['StoredMMRV2'];
export type Leaderboard = Schemas['LeaderboardV3Data'];
export type PremierTeamSummary = Schemas['PremierTeamLiteResponseData'];
export type PremierTeam = Schemas['PremierTeamV1ResponseData'];
export type PremierTeamHistory = Schemas['PremierTeamHistoryV1ResponseData'];
export type EsportsSchedule = Schemas['EsportsV1Data'];
export type VlrEvent = Schemas['EsportsV2Event'];
export type VlrEventMatch = Schemas['EsportsV2EventDetail'];
export type VlrMatch = Schemas['EsportsV2Match'];
export type VlrTeam = Schemas['EsportsV2Team'];
export type VlrTeamMatch = Schemas['EsportsV2TeamMatch'];
export type VlrTeamTransaction = Schemas['EsportsV2TeamTransaction'];
export type VlrPlayer = Schemas['EsportsV2Player'];
export type VlrPlayerMatch = Schemas['EsportsV2PlayerMatch'];
export type VlrPlayerTimespan = Schemas['EsportsV2PlayerTimespan'];
export type VlrEventType = Schemas['EsportsV2EventType'];
export type Content = Schemas['ContentV1'];
export type FeaturedStore = Schemas['StoreFeaturedV1'];
export type StoreOffers = Schemas['StoreOffersV1'];
export type ServerStatus = Schemas['StatusV1Data'];
export type QueueStatus = Schemas['QueueStatusV1Data'];
export type GameVersion = Schemas['VersionV1Data'];
export type WebsiteArticle = Schemas['WebsiteV1Data'];
export type WebsiteEntry = Schemas['WebsiteByIdV1Data'];
export type MatchMode = Schemas['MatchMode'];
export type RawPayload = Schemas['RawV1Payload'];
export type RawResult = Schemas['RawV1ResponseData'];
export type WebhookUserAdd = Schemas['PremiumWebhookUserAddRequest'];
export type WebhookUserUpdate = Schemas['PremiumWebhookUserUpdateRequest'];
export type WebhookUserMutation = Schemas['PremiumWebhookUserMutationData'];
export type WebhookDeleteResult = Schemas['PremiumWebhookDeleteData'];
