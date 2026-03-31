import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { register as registerApi, getMe } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

const INPUT = [
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm',
  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
].join(' ')

export default function RegisterPage() {
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm()
  const [globalError, setGlobalError] = useState('')
  const { login } = useAuthStore()
  const navigate = useNavigate()

  async function onSubmit({ full_name, email, password }) {
    setGlobalError('')
    try {
      const tokens = await registerApi(email, password, full_name)
      login(tokens, null)
      const me = await getMe()
      login(tokens, me)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err.response?.status === 409) {
        setError('email', { message: 'An account with this email already exists.' })
      } else if (err.response?.status === 422) {
        const detail = err.response.data?.detail
        if (Array.isArray(detail)) {
          const fieldMap = { email: 'email', password: 'password', full_name: 'full_name' }
          let handled = false
          detail.forEach(({ loc, msg }) => {
            const field = loc?.[loc.length - 1]
            if (fieldMap[field]) {
              setError(fieldMap[field], { message: msg })
              handled = true
            }
          })
          if (!handled) setGlobalError('Registration failed. Please check your inputs.')
        } else {
          setGlobalError('Registration failed. Please check your inputs.')
        }
      } else {
        setGlobalError('Registration failed. Please try again.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-[12px] shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-primary">UFMS</div>
          <h1 className="text-xl font-semibold text-gray-900 mt-1">Create account</h1>
          <p className="text-sm text-gray-500">User Feedback Management System</p>
        </div>

        {globalError && <Alert type="error" className="mb-4">{globalError}</Alert>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input
              type="text"
              placeholder="Jane Doe"
              className={INPUT}
              {...register('full_name', { required: 'Full name is required' })}
            />
            {errors.full_name && (
              <p className="text-xs text-red-600 mt-1">{errors.full_name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              type="email"
              placeholder="you@example.com"
              className={INPUT}
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Please enter a valid email address',
                },
              })}
            />
            {errors.email && (
              <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              placeholder="Min. 8 characters"
              className={INPUT}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'Minimum 8 characters' },
              })}
            />
            {errors.password && (
              <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              placeholder="Repeat password"
              className={INPUT}
              {...register('confirm_password', {
                required: 'Please confirm your password',
                validate: (v) => v === watch('password') || 'Passwords do not match',
              })}
            />
            {errors.confirm_password && (
              <p className="text-xs text-red-600 mt-1">{errors.confirm_password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Create account
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
