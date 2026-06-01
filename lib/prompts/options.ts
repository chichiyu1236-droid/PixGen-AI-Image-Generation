export const imageTypes = {
  ecommerce_hero: {
    label: "电商主图",
    prompt: "premium ecommerce product hero image",
  },
  social_post: {
    label: "社交媒体图",
    prompt: "polished social media campaign image",
  },
  poster: {
    label: "宣传海报",
    prompt: "commercial poster-style promotional image",
  },
} as const;

export const aspectRatios = {
  square: {
    label: "1:1",
    prompt: "square 1:1 composition",
    size: "1024x1024",
  },
  portrait: {
    label: "4:5",
    prompt: "vertical 4:5 composition",
    size: "1024x1536",
  },
  landscape: {
    label: "16:9",
    prompt: "wide horizontal composition",
    size: "1536x1024",
  },
} as const;

export const styles = {
  premium_minimal: {
    label: "高级极简",
    prompt: "premium minimal commercial photography",
  },
  soft_realistic: {
    label: "柔和写实",
    prompt: "soft realistic editorial photography",
  },
  vibrant_ad: {
    label: "鲜明广告",
    prompt: "vibrant high-impact advertising visual",
  },
} as const;

export const scenes = {
  studio: {
    label: "影棚",
    prompt: "clean professional studio environment",
  },
  lifestyle: {
    label: "生活方式",
    prompt: "natural lifestyle environment with believable context",
  },
  outdoor: {
    label: "户外",
    prompt: "refined outdoor environment with natural light",
  },
} as const;

export const whitespaceOptions = {
  balanced: {
    label: "自然平衡",
    prompt: "balanced composition with comfortable breathing room",
  },
  top_space: {
    label: "顶部留白",
    prompt: "leave clean negative space near the top",
  },
  left_space: {
    label: "左侧留白",
    prompt: "leave clean negative space on the left side",
  },
  right_space: {
    label: "右侧留白",
    prompt: "leave clean negative space on the right side",
  },
} as const;

export type ImageTypeId = keyof typeof imageTypes;
export type AspectRatioId = keyof typeof aspectRatios;
export type StyleId = keyof typeof styles;
export type SceneId = keyof typeof scenes;
export type WhitespaceId = keyof typeof whitespaceOptions;
