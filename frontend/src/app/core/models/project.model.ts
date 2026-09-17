import { Deck } from './deck.model';

export interface Publication {
  slug: string;
  path: string;
  publishedAt: string;
  updatedAt: string | null;
  viewCount: number;
}

export interface ProjectSummary {
  id: number;
  title: string;
  description: string;
  slideCount: number;
  theme: string;
  createdAt: string;
  updatedAt: string;
  publication: Publication | null;
}

export type Project = ProjectSummary & { deck: Deck };

export interface PublishedPresentation {
  slug: string;
  title: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  deck: Deck;
}
