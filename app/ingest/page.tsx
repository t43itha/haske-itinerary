"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Upload, FileText, Mail, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ParsedTicket } from "@/lib/types"

export default function IngestPage() {
  const router = useRouter()
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<ParsedTicket | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const validateFile = (file: File): boolean => {
    const validTypes = [
      'application/pdf',
      'message/rfc822',
      'text/html',
      'application/octet-stream' // For .eml files
    ]
    const validExtensions = ['.pdf', '.eml', '.html', '.htm']
    
    const isValidType = validTypes.includes(file.type)
    const isValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    )
    
    return isValidType || isValidExtension
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) {
      const droppedFile = droppedFiles[0]
      
      if (!validateFile(droppedFile)) {
        setError('Please upload a PDF, EML, or HTML file')
        return
      }

      setFile(droppedFile)
      setError(null)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (!validateFile(selectedFile)) {
        setError('Please upload a PDF, EML, or HTML file')
        return
      }
      
      setFile(selectedFile)
      setError(null)
    }
  }

  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  const processTicket = async (retryCount = 0) => {
    if (!file) {
      setError('Please upload a file')
      return
    }

    console.log(`🔄 Processing ticket (attempt ${retryCount + 1}/3):`, file.name)
    setIsProcessing(true)
    setError(null)

    try {
      // Extract text from uploaded file via API
      const formData = new FormData()
      formData.append('file', file)
      
      console.log('📡 Calling extract API...')
      const extractResponse = await fetch('/api/ingest/extract', {
        method: 'POST',
        body: formData,
      })
      
      if (!extractResponse.ok) {
        const errorData = await extractResponse.json()
        console.error('❌ Extract API failed:', errorData)
        throw new Error(errorData.error || 'Failed to extract text from file')
      }
      
      const extractResult = await extractResponse.json()
      console.log('✅ Extract API successful:', {
        textLength: extractResult.data?.text?.length || 0,
        htmlLength: extractResult.data?.html?.length || 0
      })
      const extractedText = extractResult.data

      // Parse the extracted text via API
      console.log('📡 Calling parse API...')
      const parseResponse = await fetch('/api/ingest/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: extractedText.text,
          html: extractedText.html,
        }),
      })
      
      if (!parseResponse.ok) {
        const errorData = await parseResponse.json()
        console.error('❌ Parse API failed:', errorData)
        throw new Error(errorData.error || 'Failed to parse ticket data')
      }
      
      const parseResult = await parseResponse.json()
      console.log('✅ Parse API successful')
      setParsedData(parseResult.data)
      
    } catch (err) {
      console.error('❌ Processing failed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to process ticket'
      
      // Retry logic for fetch errors
      if (retryCount < 2 && (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to fetch'))) {
        console.log(`🔄 Retrying in 2 seconds... (attempt ${retryCount + 2}/3)`)
        setTimeout(() => {
          processTicket(retryCount + 1)
        }, 2000)
        return
      }
      
      setError(`${errorMessage}${retryCount > 0 ? ` (tried ${retryCount + 1} times)` : ''}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const getFileIcon = (fileName: string) => {
    const name = fileName.toLowerCase()
    if (name.endsWith('.pdf')) return <FileText className="w-5 h-5 text-red-500" />
    if (name.endsWith('.eml')) return <Mail className="w-5 h-5 text-blue-500" />
    if (name.endsWith('.html') || name.endsWith('.htm')) return <FileText className="w-5 h-5 text-orange-500" />
    return <FileText className="w-5 h-5 text-gray-500" />
  }

  const reset = () => {
    setFile(null)
    setParsedData(null)
    setError(null)
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Import E-Ticket
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Upload your airline e-ticket (PDF, email, or HTML file) to auto-populate your itinerary
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-700 font-medium">Error:</p>
            <p className="text-red-600 mt-1">{error}</p>
            <div className="mt-3 space-y-2 text-sm text-red-600">
              <p><strong>Troubleshooting tips:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>Check that your file is a valid PDF, EML, or HTML file</li>
                <li>Ensure the file is not corrupted or password-protected</li>
                <li>Try refreshing the page and uploading again</li>
                <li>Check your internet connection and server logs</li>
              </ul>
            </div>
          </div>
        )}

        <div className="mb-8">
          {/* File Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload File
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragActive
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                } ${file ? 'bg-green-50 border-green-300' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                {file ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      {getFileIcon(file.name)}
                      <span className="text-sm font-medium">{file.name}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={reset}
                      className="mt-2"
                    >
                      Change File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="w-10 h-10 text-gray-400 mx-auto" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Drop your e-ticket here
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        PDF, EML, or HTML files only
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-center">
                      <Badge variant="secondary" className="text-xs">PDF</Badge>
                      <Badge variant="secondary" className="text-xs">EML</Badge>
                      <Badge variant="secondary" className="text-xs">HTML</Badge>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.eml,.html,.htm"
                      onChange={handleFileChange}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={handleBrowseClick}
                    >
                      Browse Files
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Process Button */}
        <div className="text-center mb-8">
          <Button
            onClick={processTicket}
            disabled={isProcessing || !file}
            size="lg"
            className="px-8"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Extract Flight Information'
            )}
          </Button>
        </div>

        {/* Results Section */}
        {parsedData && (
          <Card>
            <CardHeader>
              <CardTitle>Extracted Flight Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Carrier:</strong> {parsedData.carrier}
                  </div>
                  {parsedData.airlineLocator && (
                    <div>
                      <strong>Booking Reference:</strong> {parsedData.airlineLocator}
                    </div>
                  )}
                  <div>
                    <strong>Passengers:</strong> {parsedData.passengers.length}
                  </div>
                  <div>
                    <strong>Segments:</strong> {parsedData.segments.length}
                  </div>
                </div>

                {parsedData.passengers.length > 0 && (
                  <div>
                    <strong>Passenger Names:</strong>
                    <ul className="mt-1 text-sm text-gray-600">
                      {parsedData.passengers.map((pax, idx) => (
                        <li key={idx}>• {pax.fullName}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsedData.segments.length > 0 && (
                  <div>
                    <strong>Flight Segments:</strong>
                    <ul className="mt-1 text-sm text-gray-600">
                      {parsedData.segments.map((segment, idx) => (
                        <li key={idx}>
                          • {segment.marketingFlightNo} - {segment.dep.city || segment.dep.iata} → {segment.arr.city || segment.arr.iata}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={reset}>
                    Start Over
                  </Button>
                  <Button onClick={() => {
                    if (parsedData) {
                      // Store parsed data in session storage for the review page
                      sessionStorage.setItem('parsedTicketData', JSON.stringify(parsedData))
                      // Navigate to review page
                      router.push('/ingest/review')
                    }
                  }}>
                    Review & Apply
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}