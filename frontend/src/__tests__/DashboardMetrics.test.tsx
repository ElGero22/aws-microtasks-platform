import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MetricsCard, BudgetTracker, EarningsBreakdown, ExportButton, Leaderboard } from '../components/DashboardMetrics';

// Wrapper for router context
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>{children}</BrowserRouter>
);

describe('MetricsCard', () => {
    it('renders with correct value and title', () => {
        render(
            <MetricsCard
                title="Test Metric"
                value="$100.00"
                icon="💰"
                color="primary"
            />
        );

        expect(screen.getByText('Test Metric')).toBeInTheDocument();
        expect(screen.getByText('$100.00')).toBeInTheDocument();
        expect(screen.getByText('💰')).toBeInTheDocument();
    });

    it('shows trend when provided', () => {
        render(
            <MetricsCard
                title="With Trend"
                value="50"
                icon="📈"
                trend={{ value: 15, isPositive: true }}
            />
        );

        expect(screen.getByText(/15%/)).toBeInTheDocument();
    });
});

describe('BudgetTracker', () => {
    it('calculates available budget correctly', () => {
        render(
            <BudgetTracker
                totalBudget={100}
                spent={40}
                pending={20}
            />
        );

        // Available should be 100 - 40 - 20 = $40.00
        expect(screen.getByText('$40.00')).toBeInTheDocument();
        expect(screen.getByText('$20.00')).toBeInTheDocument();
    });
});

describe('EarningsBreakdown', () => {
    it('displays all earning periods', () => {
        render(
            <EarningsBreakdown
                today={10.50}
                week={75.25}
                month={300.00}
                total={1200.00}
            />
        );

        expect(screen.getByText('$10.50')).toBeInTheDocument();
        expect(screen.getByText('$75.25')).toBeInTheDocument();
        expect(screen.getByText('$300.00')).toBeInTheDocument();
        expect(screen.getByText('$1200.00')).toBeInTheDocument();
    });
});

describe('Leaderboard', () => {
    const mockEntries = [
        { rank: 1, name: 'Alice', earnings: 500, tasksCompleted: 100, accuracy: 98 },
        { rank: 2, name: 'Bob', earnings: 400, tasksCompleted: 80, accuracy: 95, isCurrentUser: true },
    ];

    it('renders all leaderboard entries', () => {
        render(<Leaderboard entries={mockEntries} />);

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('$500.00')).toBeInTheDocument();
    });

    it('highlights current user', () => {
        render(<Leaderboard entries={mockEntries} />);

        expect(screen.getByText('(You)')).toBeInTheDocument();
    });
});

describe('ExportButton', () => {
    it('renders export buttons', () => {
        const mockData = [{ id: 1, name: 'Test' }];

        render(<ExportButton data={mockData} filename="test" label="Export" />);

        expect(screen.getByText('📥 Export CSV')).toBeInTheDocument();
        expect(screen.getByText('📥 Export JSON')).toBeInTheDocument();
    });

    it('triggers download on click', () => {
        const mockData = [{ id: 1, name: 'Test' }];
        const createObjectURLMock = vi.fn(() => 'blob:test');
        global.URL.createObjectURL = createObjectURLMock;

        render(<ExportButton data={mockData} filename="test" />);

        const csvButton = screen.getByText('📥 Export CSV');
        fireEvent.click(csvButton);

        expect(createObjectURLMock).toHaveBeenCalled();
    });
});
