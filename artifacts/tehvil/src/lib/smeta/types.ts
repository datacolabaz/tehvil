/**
 * AI Smeta domain models.
 *
 * These mirror the `Smeta*` schemas in `lib/api-spec/openapi.yaml`; the store
 * maps the generated API types onto them (see docs/AI_SMETA.md).
 */

export type ID = string;
/** Calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** Timestamp, ISO 8601. */
export type ISODateTime = string;

export type PropertyKind = 'menzil' | 'villa' | 'ofis' | 'magaza' | 'diger';
export type RenovationKind = 'kosmetik' | 'standart' | 'kapital' | 'premium';
export type QualityLevel = 'ekonom' | 'standart' | 'premium';

/** Work packages; every estimate section belongs to exactly one. */
export type WorkCategory =
  | 'sokuntu' | 'elektrik' | 'santexnika' | 'divar' | 'boya' | 'dosheme' | 'kafel'
  | 'tavan' | 'qapi' | 'isiqlandirma' | 'metbex' | 'sanitar' | 'temizlik';

export type Unit = 'm²' | 'm' | 'ədəd' | 'kisə' | 'xidmət' | 'komplekt' | 'litr';

export type PriceSourceKind = 'market' | 'contractor' | 'manual';
export interface PriceSource {
  kind: PriceSourceKind;
  /** Supplier or reference, e.g. "Bauhaus Bakı" or "Podratçının qiymət cədvəli". */
  reference?: string;
  updatedAt: ISODate;
}

export interface Material {
  id: ID;
  name: string;
  unit: Unit;
  category: WorkCategory;
  unitPrice: number;
  source: PriceSource;
}

export interface LaborRate {
  id: ID;
  name: string;
  unit: Unit;
  category: WorkCategory;
  rate: number;
}

/**
 * - `ai`: created from an AI proposal, must be reviewed by the contractor
 * - `draft`: entered by the contractor, not yet confirmed
 * - `approved`: confirmed by the contractor
 * - `changed`: edited after the client approved the estimate
 */
export type LineStatus = 'ai' | 'draft' | 'approved' | 'changed';

export interface QuantitySource {
  kind: 'drawing' | 'manual' | 'template' | 'formula';
  /** Human-readable explanation shown to contractor and client. */
  label: string;
  /** When `kind === 'drawing'`: quantity = sum(measurement values) × factor. */
  measurementIds?: ID[];
  factor?: number;
}

export interface EstimateLineItem {
  id: ID;
  name: string;
  zone: string;
  unit: Unit;
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  additionalCost: number;
  /** 0–1, waste/reserve applied to the material amount only. */
  wastePercentage: number;
  /** 0–1, overrides `Project.defaultMarginPercentage` when not null. */
  marginPercentage: number | null;
  priceSource: PriceSource;
  quantitySource: QuantitySource;
  status: LineStatus;
  materialId?: ID;
  laborRateId?: ID;
}

export interface EstimateSection {
  id: ID;
  category: WorkCategory;
  title: string;
  items: EstimateLineItem[];
}

export interface Estimate {
  id: ID;
  version: number;
  createdAt: ISODateTime;
  validUntil: ISODate;
  sections: EstimateSection[];
}

export interface ProjectCost {
  id: ID;
  label: string;
  amount: number;
}

export type Confidence = 'high' | 'review';
export type MeasurementStatus = 'suggested' | 'edited' | 'approved';
export interface Measurement {
  id: ID;
  kind: 'area' | 'length' | 'count' | 'height';
  name: string;
  value: number;
  unit: 'm²' | 'm' | 'ədəd';
  /** Detection confidence 0–1 as reported by the takeoff model. */
  confidence: number;
  /** Where the number came from on the drawing. */
  source: string;
  status: MeasurementStatus;
  /** Room on the drawing this measurement describes (area measurements). */
  roomId?: ID;
}

export interface DrawingRoom {
  id: ID;
  name: string;
  /** Geometry in metres from the top-left corner of the plan. */
  x: number; y: number; w: number; h: number;
}
export interface DrawingOpening {
  id: ID;
  kind: 'door' | 'window';
  /** Wall segment in metres. */
  x1: number; y1: number; x2: number; y2: number;
}
export interface Drawing {
  id: ID;
  fileName: string;
  fileType: 'pdf' | 'jpg' | 'png';
  uploadedAt: ISODateTime;
  scale: string;
  width: number;
  height: number;
  status: 'processing' | 'analyzed' | 'failed';
  rooms: DrawingRoom[];
  openings: DrawingOpening[];
}

export type ChangeStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export interface ChangeOrder {
  id: ID;
  number: number;
  title: string;
  reason: string;
  date: ISODate;
  requestedBy: 'client' | 'contractor';
  requestedByName: string;
  category: WorkCategory;
  materialDelta: number;
  laborDelta: number;
  additionalCost: number;
  status: ChangeStatus;
  photoIds: ID[];
  lineItemIds: ID[];
  decidedAt?: ISODateTime;
  decisionNote?: string;
}

export type ExpenseKind = 'material' | 'labor' | 'other';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
export interface Receipt {
  id: ID;
  fileName: string;
  fileType: 'image' | 'pdf';
  uploadedAt: ISODateTime;
  /** Object URL for files picked in this session; not persisted. */
  previewUrl?: string;
  aiSuggestion?: ReceiptSuggestion;
}
export interface ReceiptSuggestion {
  merchant: string;
  date: ISODate;
  total: number;
  category: WorkCategory;
  kind: ExpenseKind;
  confidence: number;
}
export interface Expense {
  id: ID;
  date: ISODate;
  kind: ExpenseKind;
  category: WorkCategory;
  description: string;
  vendor: string;
  amount: number;
  paymentStatus: PaymentStatus;
  receiptId?: ID;
  lineItemId?: ID;
}

export type PhotoPhase = 'before' | 'during' | 'after';
export interface PhotoEvidence {
  id: ID;
  phase: PhotoPhase;
  date: ISODate;
  uploadedBy: string;
  note: string;
  room: string;
  category: WorkCategory;
  lineItemId?: ID;
  clientVisible: boolean;
  /** Object URL for photos added in this session; mock photos render a placeholder. */
  url?: string;
}

export interface ClientApproval {
  id: ID;
  estimateVersion: number;
  approvedAt: ISODateTime;
  name: string;
  phone: string;
  confirmedScope: boolean;
  total: number;
}
export interface RevisionRequest {
  id: ID;
  estimateVersion: number;
  createdAt: ISODateTime;
  name: string;
  message: string;
}

export interface PaymentMilestone {
  id: ID;
  title: string;
  /** 0–1 share of the estimate total. */
  share: number;
  condition: string;
  status: 'paid' | 'due' | 'planned';
}

export type ExportKind = 'xlsx' | 'pdf';
export interface ExportJob {
  id: ID;
  kind: ExportKind;
  status: 'processing' | 'ready' | 'failed';
  createdAt: ISODateTime;
  fileName: string;
}

export interface EstimateShare {
  token: string;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  clientName: string;
  phone: string;
  email?: string;
  message: string;
  notifyOnApprove: boolean;
  attachPdf: boolean;
  /** Frozen copy of the estimate the client sees. */
  snapshot: Estimate;
  snapshotProjectCosts: ProjectCost[];
  snapshotMargin: number;
}

export interface Party {
  name: string;
  phone: string;
  email?: string;
}
export interface ContractorProfile extends Party {
  company: string;
  experienceYears: number;
  completedProjects: number;
  rating: number;
}

/** Contractor-side workflow status of the estimate. */
export type EstimateStatus = 'draft' | 'sent' | 'client_approved' | 'revision_requested';

export interface Project {
  id: ID;
  name: string;
  district: string;
  address: string;
  propertyKind: PropertyKind;
  renovationKind: RenovationKind;
  quality: QualityLevel;
  areaM2: number;
  startDate: ISODate;
  endDate: ISODate;
  client: Party;
  contractor: ContractorProfile;
  /** 0–100 */
  completion: number;
  /** 0–1, project default contractor margin. */
  defaultMarginPercentage: number;
  projectCosts: ProjectCost[];
  estimate: Estimate;
  status: EstimateStatus;
  changeOrders: ChangeOrder[];
  expenses: Expense[];
  receipts: Receipt[];
  photos: PhotoEvidence[];
  drawing?: Drawing;
  measurements: Measurement[];
  approvals: ClientApproval[];
  revisionRequests: RevisionRequest[];
  payments: PaymentMilestone[];
  included: string[];
  excluded: string[];
  share?: EstimateShare;
  exports: ExportJob[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Seeded sample project: kept in this browser only, never sent to the server. */
  demo?: boolean;
}
