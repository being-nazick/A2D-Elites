import { render, screen } from '@testing-library/react';
import App from './App';

test('renders dairy app header', () => {
  render(<App />);
  const headerElement = screen.getByText(/A2D'Elites/i);
  expect(headerElement).toBeInTheDocument();
});
