import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Toast from '../../components/ui/Toast.jsx';

describe('Toast', () => {
    it('renders the message text', () => {
        render(<Toast message="Saved successfully" type="success" onDismiss={() => {}} />);
        expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    });

    it('applies green background for success type', () => {
        const { container } = render(<Toast message="OK" type="success" onDismiss={() => {}} />);
        expect(container.firstChild).toHaveClass('bg-green-600');
    });

    it('applies red background for error type', () => {
        const { container } = render(<Toast message="Error" type="error" onDismiss={() => {}} />);
        expect(container.firstChild).toHaveClass('bg-red-600');
    });

    it('calls onDismiss when dismiss button is clicked', () => {
        const onDismiss = vi.fn();
        render(<Toast message="Hello" type="success" onDismiss={onDismiss} />);
        fireEvent.click(screen.getByRole('button'));
        expect(onDismiss).toHaveBeenCalledOnce();
    });

    it('renders a dismiss button', () => {
        render(<Toast message="Hello" type="success" onDismiss={() => {}} />);
        expect(screen.getByRole('button')).toBeInTheDocument();
    });
});
