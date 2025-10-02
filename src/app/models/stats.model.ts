export type DailyStats = {
  date: string;                       // YYYY-MM-DD
  tagsPerHour: Record<string, number>;
  tagsTotal: number;
  updatedAt?: any;                    // Timestamp
};
