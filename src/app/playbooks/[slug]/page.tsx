import Link from "next/link"
import { notFound } from "next/navigation"
import { PlaybookView } from "@/components/desk/playbook-view"
import { PLAYBOOKS } from "@/lib/content"

export function generateStaticParams() {
  return PLAYBOOKS.map((playbook) => ({ slug: playbook.slug }))
}

export default async function PlaybookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const playbook = PLAYBOOKS.find((entry) => entry.slug === slug)
  if (!playbook) notFound()
  return (
    <>
      <PlaybookView playbook={playbook} />
      <p className="sr-only">
        <Link href="/playbooks">Back to playbooks</Link>
      </p>
    </>
  )
}
