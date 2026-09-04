import type { ReactElement } from 'react';

export type ReactPdfModule<TPrimitives = unknown> = TPrimitives & {
  pdf: (document: ReactElement) => {
    toBlob: () => Promise<Blob>;
  };
};
