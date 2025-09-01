import { describe, it, expect } from 'vitest';
import { inferSegmentDates, validateSegmentDates } from '../lib/utils/dateInference';
import { ParsedTicket } from '../lib/types';

describe('Date Inference Utility', () => {
  describe('inferSegmentDates', () => {
    it('should handle simple single segment with complete date/time info', () => {
      const segments: ParsedTicket['segments'] = [{
        marketingFlightNo: 'BA123',
        dep: {
          iata: 'LHR',
          city: 'London',
          date: '30 Aug 2024',
          timeLocal: '14:30'
        },
        arr: {
          iata: 'CDG',
          city: 'Paris',
          date: '30 Aug 2024',
          timeLocal: '17:45'
        }
      }];

      const result = inferSegmentDates(segments);
      
      expect(result).toHaveLength(1);
      expect(result[0].dep.date).toBe('30 Aug 2024');
      expect(result[0].dep.timeLocal).toBe('14:30');
      expect(result[0].arr.date).toBe('30 Aug 2024');
      expect(result[0].arr.timeLocal).toBe('17:45');
    });

    it('should handle overnight flights with date progression', () => {
      const segments: ParsedTicket['segments'] = [{
        marketingFlightNo: 'BA078',
        dep: {
          iata: 'ACC',
          city: 'Accra',
          date: '30 Aug 2024',
          timeLocal: '22:10'
        },
        arr: {
          iata: 'LHR',
          city: 'London',
          timeLocal: '06:15' // No date provided - should infer next day
        }
      }];

      const result = inferSegmentDates(segments);
      
      expect(result).toHaveLength(1);
      expect(result[0].dep.date).toBe('30 Aug 2024');
      expect(result[0].dep.timeLocal).toBe('22:10');
      expect(result[0].arr.date).toBe('31 Aug 2024'); // Should be next day
      expect(result[0].arr.timeLocal).toBe('06:15');
    });

    it('should handle complex multi-segment connecting flights', () => {
      const segments: ParsedTicket['segments'] = [
        {
          marketingFlightNo: 'SA53',
          dep: {
            iata: 'ACC',
            city: 'Accra',
            date: '30 Aug 2024',
            timeLocal: '22:10'
          },
          arr: {
            iata: 'JNB',
            city: 'Johannesburg',
            timeLocal: '06:15' // Should infer 31 Aug
          }
        },
        {
          marketingFlightNo: 'SA303',
          dep: {
            iata: 'JNB',
            city: 'Johannesburg',
            timeLocal: '08:30' // Should infer 31 Aug (same day connection)
          },
          arr: {
            iata: 'CPT',
            city: 'Cape Town',
            timeLocal: '10:45' // Should infer 31 Aug
          }
        },
        {
          marketingFlightNo: 'SA366',
          dep: {
            iata: 'CPT',
            city: 'Cape Town',
            date: '04 Oct 2024', // Return flight several days later
            timeLocal: '04:00'
          },
          arr: {
            iata: 'JNB',
            city: 'Johannesburg',
            timeLocal: '06:15' // Should infer same day
          }
        },
        {
          marketingFlightNo: 'SA52',
          dep: {
            iata: 'JNB',
            city: 'Johannesburg',
            timeLocal: '05:00' // Should infer 05 Oct (next day layover)
          },
          arr: {
            iata: 'ACC',
            city: 'Accra',
            timeLocal: '05:00' // Should infer 05 Oct
          }
        }
      ];

      const result = inferSegmentDates(segments);
      
      expect(result).toHaveLength(4);
      
      // First segment: ACC→JNB overnight
      expect(result[0].dep.date).toBe('30 Aug 2024');
      expect(result[0].arr.date).toBe('31 Aug 2024');
      
      // Second segment: JNB→CPT same day connection
      expect(result[1].dep.date).toBe('31 Aug 2024');
      expect(result[1].arr.date).toBe('31 Aug 2024');
      
      // Third segment: Return flight
      expect(result[2].dep.date).toBe('04 Oct 2024');
      expect(result[2].arr.date).toBe('04 Oct 2024');
      
      // Fourth segment: JNB→ACC (should be next day based on timing)
      expect(result[3].dep.date).toBe('05 Oct 2024');
      expect(result[3].arr.date).toBe('05 Oct 2024');
    });

    it('should handle missing dates by using reference dates', () => {
      const segments: ParsedTicket['segments'] = [
        {
          marketingFlightNo: 'BA123',
          dep: {
            iata: 'LHR',
            city: 'London',
            timeLocal: '09:00' // No date
          },
          arr: {
            iata: 'CDG',
            city: 'Paris',
            timeLocal: '12:15' // No date
          }
        },
        {
          marketingFlightNo: 'AF456',
          dep: {
            iata: 'CDG',
            city: 'Paris',
            date: '15 Dec 2024', // Reference date provided here
            timeLocal: '14:30'
          },
          arr: {
            iata: 'FCO',
            city: 'Rome',
            timeLocal: '16:45' // No date
          }
        }
      ];

      const result = inferSegmentDates(segments);
      
      expect(result).toHaveLength(2);
      // Second segment has the reference date
      expect(result[1].dep.date).toBe('15 Dec 2024');
      expect(result[1].arr.date).toBe('15 Dec 2024');
      
      // First segment should have been inferred (could be same day or previous day)
      expect(result[0].dep.date).toBeTruthy();
      expect(result[0].arr.date).toBeTruthy();
    });

    it('should handle segments with only times (no dates)', () => {
      const segments: ParsedTicket['segments'] = [{
        marketingFlightNo: 'LH789',
        dep: {
          iata: 'FRA',
          city: 'Frankfurt',
          timeLocal: '10:15'
        },
        arr: {
          iata: 'MUC',
          city: 'Munich',
          timeLocal: '11:30'
        }
      }];

      const result = inferSegmentDates(segments);
      
      expect(result).toHaveLength(1);
      // Should use current date as fallback and infer same day
      expect(result[0].dep.date).toBeTruthy();
      expect(result[0].arr.date).toBeTruthy();
      expect(result[0].dep.timeLocal).toBe('10:15');
      expect(result[0].arr.timeLocal).toBe('11:30');
    });
  });

  describe('validateSegmentDates', () => {
    it('should pass validation for chronologically correct segments', () => {
      const segments: ParsedTicket['segments'] = [
        {
          marketingFlightNo: 'BA123',
          dep: {
            iata: 'LHR',
            date: '30 Aug 2024',
            timeLocal: '09:00'
          },
          arr: {
            iata: 'CDG',
            date: '30 Aug 2024',
            timeLocal: '12:15'
          }
        },
        {
          marketingFlightNo: 'AF456',
          dep: {
            iata: 'CDG',
            date: '30 Aug 2024',
            timeLocal: '14:30'
          },
          arr: {
            iata: 'FCO',
            date: '30 Aug 2024',
            timeLocal: '16:45'
          }
        }
      ];

      const result = validateSegmentDates(segments);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when departure is after arrival in same segment', () => {
      const segments: ParsedTicket['segments'] = [{
        marketingFlightNo: 'BA123',
        dep: {
          iata: 'LHR',
          date: '30 Aug 2024',
          timeLocal: '15:00'
        },
        arr: {
          iata: 'CDG',
          date: '30 Aug 2024',
          timeLocal: '12:00' // Earlier than departure
        }
      }];

      const result = validateSegmentDates(segments);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('departure is not before arrival');
    });

    it('should fail validation when connecting flight departs before previous arrival', () => {
      const segments: ParsedTicket['segments'] = [
        {
          marketingFlightNo: 'BA123',
          dep: {
            iata: 'LHR',
            date: '30 Aug 2024',
            timeLocal: '09:00'
          },
          arr: {
            iata: 'CDG',
            date: '30 Aug 2024',
            timeLocal: '12:15'
          }
        },
        {
          marketingFlightNo: 'AF456',
          dep: {
            iata: 'CDG',
            date: '30 Aug 2024',
            timeLocal: '11:30' // Before previous arrival
          },
          arr: {
            iata: 'FCO',
            date: '30 Aug 2024',
            timeLocal: '14:00'
          }
        }
      ];

      const result = validateSegmentDates(segments);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('departure is not after previous segment arrival');
    });

    it('should handle overnight flights correctly in validation', () => {
      const segments: ParsedTicket['segments'] = [{
        marketingFlightNo: 'BA078',
        dep: {
          iata: 'ACC',
          date: '30 Aug 2024',
          timeLocal: '22:10'
        },
        arr: {
          iata: 'LHR',
          date: '31 Aug 2024', // Next day
          timeLocal: '06:15'
        }
      }];

      const result = validateSegmentDates(segments);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Date format handling', () => {
    it('should handle various date formats', () => {
      const testCases = [
        { input: '30 Aug 2024', expected: true },
        { input: '2024-08-30', expected: true },
        { input: '30/08/2024', expected: true },
        { input: 'Aug 30, 2024', expected: true },
        { input: 'invalid date', expected: false }
      ];

      testCases.forEach(({ input, expected }) => {
        const segments: ParsedTicket['segments'] = [{
          marketingFlightNo: 'TEST123',
          dep: {
            iata: 'LHR',
            date: input,
            timeLocal: '12:00'
          },
          arr: {
            iata: 'CDG',
            date: input,
            timeLocal: '15:00'
          }
        }];

        const result = inferSegmentDates(segments);
        
        if (expected) {
          expect(result[0].dep.date).toBeTruthy();
          expect(result[0].arr.date).toBeTruthy();
        } else {
          // Invalid dates should still get processed but may use fallbacks
          expect(result).toHaveLength(1);
        }
      });
    });

    it('should handle various time formats', () => {
      const testCases = [
        { input: '14:30', expected: '14:30' },
        { input: '2:30 PM', expected: '14:30' },
        { input: '2:30PM', expected: '14:30' },
        { input: '12:00 AM', expected: '00:00' },
        { input: '12:00 PM', expected: '12:00' }
      ];

      testCases.forEach(({ input, expected }) => {
        const segments: ParsedTicket['segments'] = [{
          marketingFlightNo: 'TEST123',
          dep: {
            iata: 'LHR',
            date: '30 Aug 2024',
            timeLocal: input
          },
          arr: {
            iata: 'CDG',
            date: '30 Aug 2024',
            timeLocal: input
          }
        }];

        const result = inferSegmentDates(segments);
        
        expect(result[0].dep.timeLocal).toBe(expected);
        expect(result[0].arr.timeLocal).toBe(expected);
      });
    });
  });
});