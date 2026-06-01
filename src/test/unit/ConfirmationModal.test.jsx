import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmationModal from '../../components/modals/ConfirmationModal.jsx';

describe('ConfirmationModal', () => {
    const defaultProps = {
        title: 'Delete song?',
        message: 'This cannot be undone.',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
    };

    it('renders the title', () => {
        render(<ConfirmationModal {...defaultProps} />);
        expect(screen.getByText('Delete song?')).toBeInTheDocument();
    });

    it('renders the message', () => {
        render(<ConfirmationModal {...defaultProps} />);
        expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    });

    it('renders default button labels', () => {
        render(<ConfirmationModal {...defaultProps} />);
        expect(screen.getByText('Confirm')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('renders custom button labels', () => {
        render(<ConfirmationModal {...defaultProps} confirmText="Yes, delete" cancelText="Go back" />);
        expect(screen.getByText('Yes, delete')).toBeInTheDocument();
        expect(screen.getByText('Go back')).toBeInTheDocument();
    });

    it('calls onConfirm when confirm button is clicked', () => {
        const onConfirm = vi.fn();
        render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />);
        fireEvent.click(screen.getByText('Confirm'));
        expect(onConfirm).toHaveBeenCalledOnce();
    });

    it('calls onCancel when cancel button is clicked', () => {
        const onCancel = vi.fn();
        render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);
        fireEvent.click(screen.getByText('Cancel'));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('calls onCancel when the modal backdrop close button is clicked', () => {
        const onCancel = vi.fn();
        render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);
        // The Modal component renders a × close button
        const closeButtons = screen.getAllByRole('button');
        const xButton = closeButtons.find(b => b.textContent === '×');
        fireEvent.click(xButton);
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('applies red background to confirm button by default', () => {
        render(<ConfirmationModal {...defaultProps} />);
        const confirmBtn = screen.getByText('Confirm');
        expect(confirmBtn).toHaveClass('bg-red-600');
    });

    it('applies custom color to confirm button', () => {
        render(<ConfirmationModal {...defaultProps} confirmColor="bg-blue-600" />);
        const confirmBtn = screen.getByText('Confirm');
        expect(confirmBtn).toHaveClass('bg-blue-600');
    });
});
