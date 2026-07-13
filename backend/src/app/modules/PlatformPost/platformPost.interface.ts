export interface IPlatformPost {
  platform: string;
  post_id: string;
  content_snippet?: string;
  embedding: number[];
  metrics: {
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
  published_at?: Date;
  fetched_at: Date;
}
