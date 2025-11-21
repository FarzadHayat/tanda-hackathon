'use client'

interface CopyButtonProps {
  text: string
}

export default function CopyButton({ text }: CopyButtonProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
  }

  return (
    <button
      onClick={handleCopy}
      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
    >
      Copy
    </button>
  )
}
