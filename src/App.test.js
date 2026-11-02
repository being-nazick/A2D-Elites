import { render, screen } from '@testing-library/react';
import App from './App';

// Mock browser / native / ESM-specific dependencies during Jest
jest.mock('./components/LocationPicker', () => () => <div data-testid="location-picker" />);

jest.mock('./features/invoiceService', () => ({
  generateBill: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./billing', () => ({
  getMonthlySummaries: jest.fn().mockReturnValue([]),
  generateMonthlyStatementPDF: jest.fn().mockResolvedValue(undefined),
}));

test('renders dairy app header', () => {
  render(<App />);
  const headerElement = screen.getByText(/A2D'Elites/i);
  expect(headerElement).toBeInTheDocument();
});
