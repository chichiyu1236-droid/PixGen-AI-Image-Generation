export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  amountFen: number;
  description: string;
};

export const creditPacks: readonly CreditPack[] = [
  {
    id: "starter-20",
    name: "尝鲜包",
    credits: 20,
    amountFen: 990,
    description: "20 积分，可生成 20 张图片",
  },
];

export function getCreditPack(packId: string): CreditPack | undefined {
  return creditPacks.find((pack) => pack.id === packId);
}
