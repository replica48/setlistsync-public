import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Spinner from '../../components/ui/Spinner.jsx';

describe('Spinner', () => {
    it('renders without crashing', () => {
        const { container } = render(<Spinner />);
        expect(container.firstChild).toBeInTheDocument();
    });

    it('has the animate-spin class', () => {
        const { container } = render(<Spinner />);
        expect(container.firstChild).toHaveClass('animate-spin');
    });
});
