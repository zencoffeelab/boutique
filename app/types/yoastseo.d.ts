declare module "yoastseo" {
  export class Paper {
    constructor(text: string, attributes?: Record<string, unknown>);
  }

  export class ContentAssessor {
    constructor(researcher: unknown);
  }

  export const assessors: {
    SEOAssessor: new (researcher: unknown) => unknown;
  };

  export const helpers: {
    measureTextWidth(text: string): number;
  };

  const fallback: {
    Paper: typeof Paper;
    ContentAssessor: typeof ContentAssessor;
  };
  export default fallback;
}

declare module "yoastseo/build/languageProcessing/languages/fr/Researcher.js" {
  const Researcher: new (paper: unknown) => unknown;
  export default Researcher;
}

declare module "yoastseo/build/languageProcessing/languages/en/Researcher.js" {
  const Researcher: new (paper: unknown) => unknown;
  export default Researcher;
}
