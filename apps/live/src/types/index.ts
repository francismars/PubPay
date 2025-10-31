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

export interface ZapNotification {
  id: string;
  zapperName: string;
  zapperImage: string;
  content: string;
  amount: number;
  timestamp: number;
  zapperRank?: number; // 1, 2, or 3 for top zappers
}
