import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { Suspense, type ReactNode } from "react"
import { Shell } from "@/components/desk/shell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DeskProvider } from "@/lib/desk"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
})

export const metadata: Metadata = {
  title: "Reconomy",
  description: "Returns desk. Photos in, a category and an optional brand, then the route with the highest net recovery value.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider delayDuration={200}>
          <DeskProvider>
            <Suspense fallback={<p className="p-6 font-sans text-sm text-muted-foreground">Loading the desk</p>}>
              <Shell>{children}</Shell>
            </Suspense>
          </DeskProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
