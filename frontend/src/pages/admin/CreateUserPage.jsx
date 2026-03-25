import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { createUser } from '../../api/admin'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

const INPUT = [
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm',
  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
].join(' ')

export default function CreateUserPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { role: 'customer' } })
  const [error, setError] = useState('')

  async function onSubmit(data) {
    setError('')
    try {
      await createUser(data)
      navigate('/admin/users')
    } catch (err) {
      if (err.response?.status === 409)
        setError('An account with this email already exists.')
      else setError('Failed to create account. Please try again.')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Create Account</h2>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
          <input
            type="text"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select className={INPUT} {...register('role')}>
            <option value="customer">Customer</option>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/users')}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Create Account
          </Button>
        </div>
      </form>
    </div>
  )
}
