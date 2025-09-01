import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plane, Clock } from "lucide-react"
import { type FlightSegment } from "@/lib/providers/aerodatabox"
import { formatFlightTimeWithDate, formatFlightTimeOnly } from "@/lib/utils/timeFormatting"

interface SegmentsTableProps {
  segments: FlightSegment[]
}

// Removed - now using military time formatting from utils

function getStatusVariant(status: string) {
  switch (status.toLowerCase()) {
    case "scheduled":
      return "secondary"
    case "active":
    case "en-route":
      return "default"
    case "landed":
    case "arrived":
      return "secondary"
    case "delayed":
      return "destructive"
    case "cancelled":
      return "destructive"
    default:
      return "secondary"
  }
}

export function SegmentsTable({ segments }: SegmentsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plane className="w-5 h-5" />
          Flight Segments
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flight</TableHead>
                <TableHead>Departure</TableHead>
                <TableHead>Arrival</TableHead>
                <TableHead>Aircraft</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{segment.flightNumber}</div>
                      <div className="text-sm text-gray-600">{segment.airline}</div>
                      {segment.codeshares && segment.codeshares.length > 0 && (
                        <div className="text-xs text-gray-500">
                          Codeshare: {segment.codeshares.join(", ")}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{segment.departure.code}</div>
                      <div className="text-sm text-gray-600">
                        {segment.departure.airport}
                      </div>
                      <div className="text-sm font-mono">
                        {formatFlightTimeWithDate(segment.departure.scheduledTime)}
                      </div>
                      {segment.departure.actualTime && 
                       segment.departure.actualTime !== segment.departure.scheduledTime && (
                        <div className="text-xs text-blue-600">
                          Actual: {formatFlightTimeWithDate(segment.departure.actualTime)}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">
                        {segment.departure.terminal && `Terminal: ${segment.departure.terminal}`}
                        {segment.departure.gate && ` • Gate: ${segment.departure.gate}`}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{segment.arrival.code}</div>
                      <div className="text-sm text-gray-600">
                        {segment.arrival.airport}
                      </div>
                      <div className="text-sm font-mono">
                        {formatFlightTimeWithDate(segment.arrival.scheduledTime)}
                      </div>
                      {segment.arrival.actualTime && 
                       segment.arrival.actualTime !== segment.arrival.scheduledTime && (
                        <div className="text-xs text-blue-600">
                          Actual: {formatFlightTimeWithDate(segment.arrival.actualTime)}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">
                        {segment.arrival.terminal && `Terminal: ${segment.arrival.terminal}`}
                        {segment.arrival.gate && ` • Gate: ${segment.arrival.gate}`}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-sm">
                      {segment.aircraft || "N/A"}
                    </div>
                    {segment.duration && (
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {segment.duration}
                      </div>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant={getStatusVariant(segment.status)}>
                      {segment.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}