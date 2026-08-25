export interface Customer {
  id: string;
  storeId: string;
  externalCustomerId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  identification: string | null;
  birthDate: string | null;
  acceptsMarketing: boolean | null;
  active: boolean;
  source: "manual" | "nuvemshop" | "order";
  totalSpent: number | null;
  totalSpentCurrency: string | null;
  lastOrderId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerPayload {
  storeId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  identification?: string | null;
  birthDate?: string | null;
  acceptsMarketing?: boolean | null;
  active?: boolean;
  note?: string | null;
}

export type UpdateCustomerPayload = Partial<CreateCustomerPayload>;
