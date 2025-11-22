'use client'

import { QRCode } from 'react-qr-code'
import { useRef } from 'react'

interface QRCodeModalProps {
  isOpen: boolean
  onClose: () => void
  url: string
  eventName: string
}

export default function QRCodeModal({ isOpen, onClose, url, eventName }: QRCodeModalProps) {
  const qrRef = useRef<HTMLDivElement>(null)

  if (!isOpen) return null

  const handleDownload = () => {
    if (!qrRef.current) return

    const svg = qrRef.current.querySelector('svg')
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      canvas.width = 300
      canvas.height = 300
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      const pngFile = canvas.toDataURL('image/png')

      const downloadLink = document.createElement('a')
      downloadLink.download = `${eventName.replace(/\s+/g, '_')}_QR.png`
      downloadLink.href = pngFile
      downloadLink.click()
      URL.revokeObjectURL(url)
    }

    img.src = url
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-gray-900">QR Code</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-gray-600 mb-6 text-sm">
          Scan this QR code to access the volunteer sign-up page for <span className="font-semibold">{eventName}</span>
        </p>

        <div ref={qrRef} className="flex justify-center bg-gray-50 p-6 rounded-lg border-2 border-gray-200 mb-6">
          <QRCode
            value={url}
            size={256}
            level="H"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className="flex-1 px-4 py-3 bg-linear-to-r from-orange-600 to-purple-700 text-white rounded-lg hover:from-orange-700 hover:to-purple-800 font-medium transition-all"
          >
            Download QR Code
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
