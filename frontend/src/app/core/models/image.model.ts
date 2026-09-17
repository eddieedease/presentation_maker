export interface StoredImage {
  id: number;
  token: string;
  /** Relative to the app's base href, so subdirectory installs work. */
  url: string;
  originalName: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
}

export interface ImageLimits {
  maxBytes: number;
  maxDimension: number;
}
