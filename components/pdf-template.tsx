import React from "react"
import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer"
import { type FlightSegment } from "@/lib/providers/aerodatabox"
import { getHaskeLogo } from "@/lib/logo"
import { formatFlightTimeWithDate, formatFlightTimeOnly } from "@/lib/utils/timeFormatting"

interface ItineraryData {
  id: string
  humanId?: string
  passengers: Array<{
    name: string
    type: "adult" | "child" | "infant"
  }>
  segments: FlightSegment[]
  createdAt: string
  bookingExtras?: {
    airlineLocator?: string
    iataNumber?: string
    ticketNumbers?: Array<{
      number: string
      passengerName: string
      validUntil?: string
    }>
    baggage?: string
    handBaggage?: string
    fareDetails?: {
      baseFare?: number
      currency?: string
      carrierCharges?: number
      taxes?: Array<{
        type: string
        amount: number
        description?: string
      }>
      total?: number
    }
    fareNotes?: string
  }
}

interface PDFTemplateProps {
  itinerary: ItineraryData
}

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 30,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 30,
    borderBottom: "2 solid #D4A574",
    paddingBottom: 15,
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 0,
  },
  logo: {
    width: 100,
    height: 100 * (615/1642), // Maintain aspect ratio: ~37
    marginBottom: 0,
  },
  documentTitle: {
    fontSize: 16,
    color: "#1F2937",
    textAlign: "center",
    fontWeight: "bold",
    marginTop: 5,
  },
  companyInfo: {
    textAlign: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  companyName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 5,
  },
  contactLine: {
    fontSize: 10,
    color: "#6B7280",
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1F2937",
    marginTop: 20,
    marginBottom: 10,
    borderBottom: "1 solid #E5E7EB",
    paddingBottom: 5,
  },
  infoGrid: {
    flexDirection: "row",
    marginBottom: 20,
  },
  infoColumn: {
    flex: 1,
    marginRight: 20,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  infoLabel: {
    fontWeight: "bold",
    width: 80,
    color: "#374151",
  },
  infoValue: {
    color: "#1F2937",
    flex: 1,
  },
  passengersContainer: {
    marginBottom: 20,
  },
  passengerRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottom: "0.5 solid #F3F4F6",
  },
  passengerName: {
    flex: 1,
    fontWeight: "bold",
  },
  passengerType: {
    width: 60,
    textAlign: "right",
    textTransform: "capitalize",
    color: "#6B7280",
  },
  segmentContainer: {
    marginBottom: 15,
    border: "1 solid #E5E7EB",
    borderRadius: 4,
    padding: 15,
  },
  segmentHeader: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "center",
  },
  flightNumber: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#D4A574",
  },
  airline: {
    fontSize: 10,
    color: "#6B7280",
    marginLeft: 10,
  },
  status: {
    marginLeft: "auto",
    backgroundColor: "#F3F4F6",
    padding: "3 8",
    borderRadius: 12,
    fontSize: 8,
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  routeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  airportInfo: {
    flex: 1,
  },
  airportCode: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1F2937",
  },
  airportName: {
    fontSize: 9,
    color: "#6B7280",
    marginTop: 2,
  },
  timeInfo: {
    marginTop: 5,
  },
  scheduledTime: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1F2937",
  },
  actualTime: {
    fontSize: 9,
    color: "#D4A574",
    marginTop: 1,
  },
  terminalGate: {
    fontSize: 8,
    color: "#6B7280",
    marginTop: 2,
  },
  arrow: {
    alignSelf: "center",
    color: "#6B7280",
    fontSize: 12,
  },
  aircraftInfo: {
    fontSize: 9,
    color: "#6B7280",
    marginTop: 5,
  },
  codeshares: {
    fontSize: 8,
    color: "#6B7280",
    marginTop: 5,
    fontStyle: "italic",
  },
  footer: {
    marginTop: "auto",
    paddingTop: 20,
    borderTop: "1 solid #E5E7EB",
    textAlign: "center",
  },
  disclaimer: {
    fontSize: 9,
    color: "#DC2626",
    fontWeight: "bold",
    textAlign: "center",
    backgroundColor: "#FEF2F2",
    padding: 10,
    borderRadius: 4,
    border: "1 solid #FECACA",
  },
  generatedInfo: {
    fontSize: 8,
    color: "#9CA3AF",
    marginTop: 10,
    textAlign: "center",
  },
})

export function PDFTemplate({ itinerary }: PDFTemplateProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // Using military time formatting from utils instead of 12-hour format

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandContainer}>
            <Image src={getHaskeLogo()} style={styles.logo} />
            <Text style={styles.documentTitle}>Flight Itinerary</Text>
          </View>
        </View>

        {/* Trip Information */}
        <View style={styles.infoGrid}>
          <View style={styles.infoColumn}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Itinerary ID:</Text>
              <Text style={styles.infoValue}>{itinerary.humanId || itinerary.id}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Created:</Text>
              <Text style={styles.infoValue}>
                {formatDate(itinerary.createdAt)}
              </Text>
            </View>
            {itinerary.bookingExtras?.airlineLocator && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Booking Ref:</Text>
                <Text style={styles.infoValue}>{itinerary.bookingExtras.airlineLocator}</Text>
              </View>
            )}
          </View>
          <View style={styles.infoColumn}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Passengers:</Text>
              <Text style={styles.infoValue}>{itinerary.passengers.length}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Segments:</Text>
              <Text style={styles.infoValue}>{itinerary.segments.length}</Text>
            </View>
            {itinerary.bookingExtras?.iataNumber && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>IATA:</Text>
                <Text style={styles.infoValue}>{itinerary.bookingExtras.iataNumber}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Passengers */}
        <Text style={styles.sectionTitle}>Passengers</Text>
        <View style={styles.passengersContainer}>
          {itinerary.passengers.map((passenger, index) => (
            <View key={index} style={styles.passengerRow}>
              <Text style={styles.passengerName}>{passenger.name}</Text>
              <Text style={styles.passengerType}>{passenger.type}</Text>
            </View>
          ))}
        </View>

        {/* Flight Segments */}
        <Text style={styles.sectionTitle}>Flight Segments</Text>
        {itinerary.segments.map((segment, index) => (
          <View key={index} style={styles.segmentContainer}>
            <View style={styles.segmentHeader}>
              <Text style={styles.flightNumber}>{segment.flightNumber}</Text>
              <Text style={styles.airline}>{segment.airline}</Text>
              <Text style={styles.status}>{segment.status}</Text>
            </View>
            
            <View style={styles.routeContainer}>
              <View style={styles.airportInfo}>
                <Text style={styles.airportCode}>{segment.departure.code}</Text>
                <Text style={styles.airportName}>{segment.departure.airport}</Text>
                <View style={styles.timeInfo}>
                  <Text style={styles.scheduledTime}>
                    {formatFlightTimeWithDate(segment.departure.scheduledTime, false)}
                  </Text>
                  {segment.departure.actualTime && 
                   segment.departure.actualTime !== segment.departure.scheduledTime && (
                    <Text style={styles.actualTime}>
                      Actual: {formatFlightTimeWithDate(segment.departure.actualTime, false)}
                    </Text>
                  )}
                  {(segment.departure.terminal || segment.departure.gate) && (
                    <Text style={styles.terminalGate}>
                      {segment.departure.terminal && `Terminal ${segment.departure.terminal}`}
                      {segment.departure.gate && ` • Gate ${segment.departure.gate}`}
                    </Text>
                  )}
                </View>
              </View>
              
              <Text style={styles.arrow}>→</Text>
              
              <View style={styles.airportInfo}>
                <Text style={styles.airportCode}>{segment.arrival.code}</Text>
                <Text style={styles.airportName}>{segment.arrival.airport}</Text>
                <View style={styles.timeInfo}>
                  <Text style={styles.scheduledTime}>
                    {formatFlightTimeWithDate(segment.arrival.scheduledTime, false)}
                  </Text>
                  {segment.arrival.actualTime && 
                   segment.arrival.actualTime !== segment.arrival.scheduledTime && (
                    <Text style={styles.actualTime}>
                      Actual: {formatFlightTimeWithDate(segment.arrival.actualTime, false)}
                    </Text>
                  )}
                  {(segment.arrival.terminal || segment.arrival.gate) && (
                    <Text style={styles.terminalGate}>
                      {segment.arrival.terminal && `Terminal ${segment.arrival.terminal}`}
                      {segment.arrival.gate && ` • Gate ${segment.arrival.gate}`}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {segment.aircraft && (
              <Text style={styles.aircraftInfo}>Aircraft: {segment.aircraft}</Text>
            )}
            
            {segment.codeshares && segment.codeshares.length > 0 && (
              <Text style={styles.codeshares}>
                Codeshare flights: {segment.codeshares.join(", ")}
              </Text>
            )}
            
            {(segment as any).cabin && (
              <Text style={styles.aircraftInfo}>Cabin: {(segment as any).cabin}</Text>
            )}
          </View>
        ))}

        {/* Booking Extras */}
        {itinerary.bookingExtras && (
          <View>
            {/* Ticket Information */}
            {itinerary.bookingExtras.ticketNumbers && itinerary.bookingExtras.ticketNumbers.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Ticket Information</Text>
                <View style={styles.passengersContainer}>
                  {itinerary.bookingExtras.ticketNumbers.map((ticket, index) => (
                    <View key={index} style={styles.passengerRow}>
                      <Text style={styles.passengerName}>{ticket.passengerName}</Text>
                      <Text style={styles.infoValue}>{ticket.number}</Text>
                      {ticket.validUntil && (
                        <Text style={styles.passengerType}>Valid until {ticket.validUntil}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Baggage Information */}
            {(itinerary.bookingExtras.baggage || itinerary.bookingExtras.handBaggage) && (
              <>
                <Text style={styles.sectionTitle}>Baggage Allowance</Text>
                <View style={styles.infoGrid}>
                  {itinerary.bookingExtras.baggage && (
                    <View style={styles.infoColumn}>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Checked:</Text>
                        <Text style={styles.infoValue}>{itinerary.bookingExtras.baggage}</Text>
                      </View>
                    </View>
                  )}
                  {itinerary.bookingExtras.handBaggage && (
                    <View style={styles.infoColumn}>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Hand:</Text>
                        <Text style={styles.infoValue}>{itinerary.bookingExtras.handBaggage}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Fare Information intentionally omitted */}

            {/* Fare Notes */}
            {itinerary.bookingExtras.fareNotes && (
              <>
                <Text style={styles.sectionTitle}>Fare Conditions</Text>
                <Text style={styles.aircraftInfo}>{itinerary.bookingExtras.fareNotes}</Text>
              </>
            )}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.disclaimer}>
            This itinerary is informational and not a travel document.
          </Text>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>HASKE GLOBAL TRAVEL</Text>
            <Text style={styles.contactLine}>www.haskeglobaltravel.com | info@haskeglobaltravel.com</Text>
            <Text style={styles.contactLine}>+233 535703324 | +442081911882</Text>
            <Text style={styles.contactLine}>Accra | London | Dubai</Text>
          </View>
          <Text style={styles.generatedInfo}>
            Generated on {formatDate(new Date().toISOString())}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
