'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Hell2ClientProps = {
  isInitiallyAuthorized: boolean
  secretConfigured: boolean
}

export default function Hell2Client({
  isInitiallyAuthorized,
  secretConfigured,
}: Hell2ClientProps) {
  const [isAuthorized, setIsAuthorized] = useState(isInitiallyAuthorized)
  const [adminKey, setAdminKey] = useState('')
  const [authPending, setAuthPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  
  const [showForm, setShowForm] = useState(false)
  
  // Form fields
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [college, setCollege] = useState('')
  const [branch, setBranch] = useState('')
  const [year, setYear] = useState('')
  const [bio, setBio] = useState('')
  const [interests, setInterests] = useState('')
  const [favMovie, setFavMovie] = useState('')
  const [relationshipStatus, setRelationshipStatus] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!adminKey.trim()) {
      setErrorMessage('Enter the admin secret key.')
      return
    }

    setAuthPending(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ admin_key: adminKey.trim() }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setErrorMessage(payload?.error || 'Admin key verification failed.')
        return
      }

      setIsAuthorized(true)
      setAdminKey('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Admin key verification failed.')
    } finally {
      setAuthPending(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/admin-auth', { method: 'DELETE' })
    } catch {}

    setIsAuthorized(false)
    setAdminKey('')
  }
  
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!displayName || !username) {
      setErrorMessage('Display name and username are required')
      return
    }
    
    setIsSaving(true)
    setErrorMessage('')
    setSaveSuccess(false)
    
    try {
      const newUuid = generateUUID()
      
      const { error } = await supabase
        .from('users')
        .insert({
          uuid: newUuid,
          display_name: displayName.trim(),
          username: username.trim(),
          college: college.trim() || null,
          branch: branch.trim() || null,
          year: year.trim() || null,
          bio: bio.trim() || null,
          interests: interests.trim() ? interests.split(',').map(i => i.trim()) : null,
          fav_movie: favMovie.trim() || null,
          relationship_status: relationshipStatus.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        })
        
      if (error) throw error
      
      // Reset form
      setDisplayName('')
      setUsername('')
      setCollege('')
      setBranch('')
      setYear('')
      setBio('')
      setInterests('')
      setFavMovie('')
      setRelationshipStatus('')
      setAvatarUrl('')
      
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isAuthorized) {
    return (
      <div style={{ padding: '2rem', maxWidth: '400px', margin: '40px auto', background: '#1e1f22', borderRadius: '12px', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Admin Access</h1>
        <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input
            type="password"
            placeholder="Admin Secret"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            disabled={authPending}
            style={{ padding: '12px', borderRadius: '8px', background: '#2b2d31', border: '1px solid #3f4147', color: '#fff', fontSize: '16px' }}
          />
          <button 
            type="submit" 
            disabled={authPending}
            style={{ padding: '12px', borderRadius: '8px', background: '#5865f2', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
          >
            {authPending ? 'Unlocking...' : 'Unlock'}
          </button>
          {!secretConfigured && (
            <div style={{ color: '#ff8a8a', fontSize: '14px', marginTop: '10px' }}>
              ADMIN_BROADCAST_SECRET is not configured in the environment.
            </div>
          )}
          {errorMessage && <div style={{ color: '#ff8a8a', fontSize: '14px' }}>{errorMessage}</div>}
        </form>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 800 }}>Seed Fake Profiles</h1>
        <button 
          onClick={handleLogout}
          style={{ padding: '8px 16px', borderRadius: '6px', background: '#2b2d31', color: '#fff', border: '1px solid #3f4147', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Logout
        </button>
      </div>
      
      {!showForm ? (
        <button 
          onClick={() => setShowForm(true)}
          style={{ padding: '16px 24px', borderRadius: '12px', background: '#5865f2', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold', width: '100%', boxShadow: '0 8px 16px rgba(88,101,242,0.2)' }}
        >
          Create New Profile
        </button>
      ) : (
        <form 
          onSubmit={handleSubmit} 
          className="profile-sheet profile-sheet-edit-mode" 
          style={{ 
            position: 'relative', 
            width: '100%', 
            height: 'auto', 
            maxHeight: 'calc(100vh - 160px)', 
            overflowY: 'auto',
            background: '#2b2d31', 
            borderRadius: '18px', 
            padding: '24px', 
            margin: '0 auto', 
            border: '1px solid rgba(255,255,255,0.08)', 
            boxShadow: '0 12px 24px rgba(0,0,0,0.4)', 
            boxSizing: 'border-box',
            display: 'block'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', margin: 0 }}>New Profile Details</h2>
            <button 
              type="button"
              onClick={() => setShowForm(false)}
              style={{ background: 'transparent', border: 'none', color: '#b5bac1', cursor: 'pointer', fontSize: '24px', padding: '4px' }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoFocus
              className="profile-input"
            />
          </div>
          
          <div className="profile-field">
            <label className="profile-label" htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="unique_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="profile-input"
            />
          </div>
          
          <div className="profile-field">
            <label className="profile-label" htmlFor="college">College</label>
            <input
              id="college"
              type="text"
              placeholder="e.g. MIT, Stanford..."
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="profile-input"
            />
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="branch">Branch</label>
            <input
              id="branch"
              type="text"
              placeholder="e.g. CSE"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="profile-input"
            />
          </div>
          
          <div className="profile-field">
            <label className="profile-label" htmlFor="year">Year</label>
            <input
              id="year"
              type="text"
              placeholder="e.g. 2nd year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="profile-input"
            />
          </div>
          
          <div className="profile-field">
            <label className="profile-label" htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              placeholder="Say a little about yourself"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="profile-input profile-textarea"
              rows={4}
            />
          </div>
          
          <div className="profile-field">
            <label className="profile-label" htmlFor="interests">Interests</label>
            <input
              id="interests"
              type="text"
              placeholder="Music, football, anime (comma separated)"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              className="profile-input"
            />
          </div>
          
          <div className="profile-field">
            <label className="profile-label" htmlFor="fav-movie">Favorite movie</label>
            <input
              id="fav-movie"
              type="text"
              placeholder="Your all-time favorite"
              value={favMovie}
              onChange={(e) => setFavMovie(e.target.value)}
              className="profile-input"
            />
          </div>
          
          <div className="profile-field">
            <label className="profile-label" htmlFor="relationship-status">Relationship status</label>
            <input
              id="relationship-status"
              type="text"
              placeholder="Single, taken, it's complicated..."
              value={relationshipStatus}
              onChange={(e) => setRelationshipStatus(e.target.value)}
              className="profile-input"
            />
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="avatar-url">Avatar URL</label>
            <input
              id="avatar-url"
              type="text"
              placeholder="https://example.com/image.png"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="profile-input"
            />
          </div>
          
          {errorMessage && <div className="profile-save-status error">{errorMessage}</div>}
          {saveSuccess && <div className="profile-save-status" style={{ color: '#57F287' }}>Profile seeded successfully!</div>}
          
          <button 
            type="submit" 
            className="profile-submit"
            disabled={isSaving}
            style={{ marginTop: '24px' }}
          >
            {isSaving ? 'Seeding Profile...' : 'Save Fake Profile'}
          </button>
        </form>
      )}
    </div>
  )
}
