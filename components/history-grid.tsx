import Image from "next/image";
import type { Database } from "@/types/database";

type Generation = Database["public"]["Tables"]["generations"]["Row"];

export function HistoryGrid({ generations }: { generations: Generation[] }) {
  if (generations.length === 0) {
    return <div className="rounded-lg border border-ink/10 bg-white p-8 text-center text-ink/60">还没有生成记录。</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {generations.map((item) => (
        <article key={item.id} className="rounded-lg border border-ink/10 bg-white p-4 shadow-sm">
          {item.image_url ? (
            <Image className="aspect-square w-full rounded-md object-cover" src={item.image_url} alt={item.input_subject} width={512} height={512} />
          ) : null}
          <p className="mt-3 text-sm text-ink/50">{new Date(item.created_at).toLocaleString("zh-CN")}</p>
          <h2 className="mt-2 line-clamp-2 font-semibold">{item.input_subject}</h2>
          {item.input_extra ? <p className="mt-2 line-clamp-2 text-sm text-ink/60">{item.input_extra}</p> : null}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">查看最终提示词</summary>
            <p className="mt-2 whitespace-pre-wrap rounded-md bg-paper p-3 text-ink/70">{item.final_prompt}</p>
          </details>
          {item.image_url ? (
            <a className="mt-4 inline-block rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold" href={item.image_url} download>
              下载
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}
