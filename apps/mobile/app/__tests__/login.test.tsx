import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../login';
import { useAuth } from '../../hooks/useAuth';

// Mock the useAuth hook
jest.mock('../../hooks/useAuth', () => ({
    useAuth: jest.fn(),
}));

describe('LoginScreen', () => {
    const mockLogin = jest.fn();
    const mockUseAuth = useAuth as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUseAuth.mockReturnValue({
            login: mockLogin,
            isLoading: false,
            error: null,
        });
    });

    it('should render the login form', () => {
        const { getByPlaceholderText, getByText } = render(<LoginScreen />);
        expect(getByPlaceholderText('Email')).toBeTruthy();
        expect(getByPlaceholderText('Password')).toBeTruthy();
        expect(getByText('Sign In')).toBeTruthy();
    });

    it('should show a validation error if inputs are empty', async () => {
        const { getByText } = render(<LoginScreen />);

        // Setup empty inputs explicitly (even if they start empty, it's good practice)
        fireEvent.press(getByText('Sign In'));

        await waitFor(() => {
            expect(getByText('Please fill in all fields')).toBeTruthy();
        });

        // Ensure login was not called
        expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should call login with email and password when fields are filled', async () => {
        const { getByPlaceholderText, getByText, queryByText } = render(<LoginScreen />);

        fireEvent.changeText(getByPlaceholderText('Email'), 'test@test.com');
        fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
        fireEvent.press(getByText('Sign In'));

        await waitFor(() => {
            expect(mockLogin).toHaveBeenCalledWith({
                email: 'test@test.com',
                password: 'password123',
            });
        });

        // Ensure local error is NOT shown
        expect(queryByText('Please fill in all fields')).toBeNull();
    });
});
