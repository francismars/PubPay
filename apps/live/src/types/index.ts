// Live app specific types
export interface LiveEvent {
  id: string;
  content: string;
  author: string;
  createdAt: number;
}

export interface LiveZap {
  id: string;
  payerName: string;
  payerImage: string;
  amount: number;
  timestamp: number;
}
