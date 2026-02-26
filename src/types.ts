// ─── Providers ────────────────────────────────────────────────────────────────

export type Provider = "HYPERLIQUID";

export type LeverageType = "cross" | "isolated";

export type OrderDirection = "long" | "short";

export type OrderType = "market" | "limit";

export type TimeInForce = "Gtc" | "Ioc" | "Alo" | "FrontendMarket";

export type TpSl = "tp" | "sl";

// ─── Trading Pairs ─────────────────────────────────────────────────────────────

export type DexType = "default" | "xyz";

export interface TradingPair {
  provider: Provider;
  dex: DexType;
  symbol: string;
  baseAssetId: number;
  sizePrecision: number;
  pricePrecision: number;
  maxLeverage: number;
  isOnlyIsolated: boolean;
}

export interface TradingPairsResponse {
  pairs: TradingPair[];
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface TriggerParams {
  isMarket: boolean;
  triggerPx: number;
  tpsl: TpSl;
}

export interface AttachedTpSlOrder {
  price: number;
  size: number;
  baseAssetId: string;
  initialMarginAssetId: string;
  initialMargin: number;
  orderType: OrderType;
  isFullPosition: boolean;
}

export interface BaseOrderParams {
  provider: Provider;
  symbol: string;
  direction: OrderDirection;
  orderType: OrderType;
  leverageType: LeverageType;
  size: number;
  marginAmount: number;
  assetId: string;
  initialMarginAssetId: string;
  leverage: number;
  price: number;
  limitPrice?: number;
  reduceOnly?: boolean;
  tif?: TimeInForce;
  trigger?: TriggerParams;
  takeProfitOrders?: AttachedTpSlOrder[];
  stopLossOrders?: AttachedTpSlOrder[];
  hasExistingPosition?: boolean;
  tradeType?: string;
  expirationDate?: number;
}

export interface PlaceOrderRequest {
  provider: Provider;
  orders: BaseOrderParams[];
}

export interface CancelOrder {
  assetIndex: number;
  oid: number;
}

export interface CancelOrderRequest {
  provider: Provider;
  cancels: CancelOrder[];
}

export interface ModifyOrderRequest {
  provider: Provider;
  oid: number;
  order: BaseOrderParams;
}

export interface ClosePositionRequest {
  provider: Provider;
  symbol: string;
  positionSide: OrderDirection;
  size: number;
  currentPrice: number;
  closePercent: number;
}

// ─── Leverage ─────────────────────────────────────────────────────────────────

export interface UpdateLeverageRequest {
  provider: Provider;
  symbol: string;
  leverage: number;
  leverageType: LeverageType;
}

// ─── Perp Registration ────────────────────────────────────────────────────────

export interface RegisterPerpRequest {
  provider: Provider;
}

export interface RegisterPerpResponse {
  accountId: string;
  walletAddress: string;
  provider: Provider;
  isActive: boolean;
}

// ─── Auth (EIP-712) ───────────────────────────────────────────────────────────

export interface AuthPayloadRequest {
  mainWalletAddress: string;
}

export interface Eip712Domain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
}

export interface Eip712Payload {
  domain: Eip712Domain;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuthSubmitRequest {
  mainWalletAddress: string;
  signature: string;
  metadata?: Record<string, unknown>;
}

// ─── Hyperliquid Direct API ───────────────────────────────────────────────────

export interface HlPosition {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage: number;
  cumFunding: {
    allTime: string;
    sinceOpen: string;
    sinceChange: string;
  };
  leverage: {
    type: LeverageType;
    value: number;
    rawUsd?: string;
  };
}

export interface HlAssetPosition {
  position: HlPosition;
  type: "oneWay";
}

export interface HlClearinghouseState {
  assetPositions: HlAssetPosition[];
  crossMaintenanceMarginUsed: string;
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  time: number;
  withdrawable: string;
}

export interface HlOpenOrder {
  coin: string;
  limitPx: string;
  oid: number;
  origSz: string;
  reduceOnly: boolean;
  side: "B" | "A";
  sz: string;
  timestamp: number;
  cloid?: string;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ArenaErrorCode =
  | "UNSUPPORTED_PROVIDER"
  | "NO_ACTIVE_PERP_ACCOUNT"
  | "NO_ACTIVE_API_WALLET"
  | "MARKET_METADATA_FETCH_FAILED"
  | "INVALID_ASSET"
  | "INVALID_ORDER_PARAMS"
  | "EXCHANGE_REJECTED"
  | "TICK_SIZE_VIOLATION"
  | "MIN_TRADE_NOTIONAL"
  | "INSUFFICIENT_MARGIN"
  | "REDUCE_ONLY_VIOLATION"
  | "RATE_LIMIT_EXCEEDED"
  | "UNAUTHORIZED"
  | "UNKNOWN";

export interface ArenaErrorDetails {
  operation?: string;
  exchangeStatus?: string;
  exchangeErrors?: string[];
  rawResponse?: unknown;
}

export interface ArenaErrorResponse {
  statusCode: number;
  errorCode: ArenaErrorCode;
  message: string;
  details?: ArenaErrorDetails;
  resolution?: string;
}
