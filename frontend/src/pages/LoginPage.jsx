import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { login as loginApi, getMe } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

// Shared input class to avoid repetition
const INPUT = [
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm',
  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
].join(' ')

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm()
  const [error, setError] = useState('')
  const { login } = useAuthStore()
  const navigate = useNavigate()

  async function onSubmit({ email, password }) {
    setError('')
    try {
      const tokens = await loginApi(email, password)
      // Put tokens in store so the interceptor can immediately use them for /auth/me
      login(tokens, null)
      const me = await getMe()
      login(tokens, me)
      navigate(
        me.role === 'admin' ? '/admin/users' : me.role === 'agent' ? '/agent/tickets' : '/dashboard',
        { replace: true },
      )
    } catch (err) {
      if (err.response?.status === 401) setError('Invalid email or password.')
      else if (err.response?.status === 403) setError('Your account has been deactivated.')
      else setError('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-[12px] shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-primary">UFMS</div>
          <h1 className="text-xl font-semibold text-gray-900 mt-1">Sign in</h1>
          <p className="text-sm text-gray-500">User Feedback Management System</p>
        </div>

        {error && <Alert type="error" className="mb-4">{error}</Alert>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              type="email"
              placeholder="you@example.com"
              className={INPUT}
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && (
              <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className={INPUT}
              {...register('password', { required: 'Password is required' })}
            />
            {errors.password && (
              <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
