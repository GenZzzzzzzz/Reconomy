import Link from "next/link"

export default function NotFound() {
  return (
    <div className="px-6 py-10">
      <h1 className="font-sans text-[28px] leading-[34px] font-semibold">That page is not on this desk</h1>
      <p className="mt-2 font-sans text-sm text-muted-foreground">The queue is the place to start.</p>
      <Link href="/" className="mt-4 inline-block font-sans text-sm text-cyan">
        Back to the queue
      </Link>
    </div>
  )
}
