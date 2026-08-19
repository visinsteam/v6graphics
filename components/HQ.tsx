'use client'

import { ChangeEvent, Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  loadActivityFeed, loadBrandAssets, loadDiscordSettings, loadNewsArticles, loadNewsSettings, loadChangeRequests, loadCreativeServices, loadCreatorHub, loadGallery, loadMembers, loadRecruitmentPositions, loadServiceProviders, loadServiceRequests, loadSettings, loadTeams, loadYouTube, loadWebsiteContent, recordActivity, updateServiceRequest,
  auditDiscordMembers, publishMemberWelcomeToDiscord, publishNewsToDiscord, syncAllSafeDiscordMembers, syncMemberDiscord, reviewChange, saveSection, submitChange, type ChangeRequest, type DiscordAuditSummary, type DiscordSettings,
} from '@/lib/data'
import { defaultBrandAssets, defaultCreativeServices, defaultCreatorHub, defaultMembers, defaultNewsSettings, defaultRecruitmentPositions, defaultServiceProviders, defaultSettings, defaultTeams, defaultWebsiteContent } from '@/lib/default-data'
import {
  countryOptions,
  DEFAULT_PROFILE_IMAGE,
  positionOptions,
  teamRoleOptions,
} from '@/lib/member-profiles'
import type {
  ActivityEvent,
  AdminRole,
  BrandAsset,
  CreatorActivity,
  CreatorAbsence,
  CreatorHubData,
  CreatorReview,
  GalleryItem,
  Member,
  OrganisationPosition,
  CreativeService, NewsArticle, NewsSettings, RecruitmentPosition, ServiceProvider, ServiceRequest, ServiceRequestStatus,
  SiteSettings,
  Team,
  TeamRole,
  YouTubeSettings, WebsiteContent,
} from '@/lib/types'

type Profile = { display_name: string | null; email: string; role: AdminRole; active: boolean }
type MemberStatusFilter = 'active' | 'archived' | 'all'

const nextVersion = (version: string) => {
  const parts = version.split('.')
  return `${Number(parts[0] ?? 1)}.${Number(parts[1] ?? 0) + 1}`
}

const newMember = (name = ''): Member => ({
  id: crypto.randomUUID(),
  name,
  position: '',
  tiktok: '',
  discordUserId: '',
  usesTeamTikTok: false,
  active: true,
  inputType: '',
  dpi: '',
  sensitivity: '',
  countryCode: '',
  profileImage: DEFAULT_PROFILE_IMAGE,
  memberships: [],
})


function CountryPicker({value,onChange,disabled=false}:{value:string;onChange:(code:string)=>void;disabled?:boolean}){
  const selected=countryOptions.find((item)=>item.code===value)
  const [query,setQuery]=useState(selected?.label||'')
  const [open,setOpen]=useState(false)
  useEffect(()=>{setQuery(selected?.label||'')},[value,selected?.label])
  const filtered=countryOptions.filter((item)=>item.label.toLowerCase().includes(query.toLowerCase())).slice(0,12)
  return <div className="country-picker">
    <input disabled={disabled} value={query} placeholder="Search country…" onFocus={()=>setOpen(true)} onChange={(event)=>{setQuery(event.target.value);setOpen(true);if(!event.target.value)onChange('')}} />
    {open&&!disabled&&<div className="country-picker-menu">{filtered.map((item)=><button type="button" key={item.code||'none'} onMouseDown={(event)=>event.preventDefault()} onClick={()=>{onChange(item.code);setQuery(item.label);setOpen(false)}}>{item.code&&<img src={`https://flagcdn.com/w40/${item.code}.png`} alt=""/>}<span>{item.label}</span></button>)}</div>}
  </div>
}

export default function HQ() {
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState('overview')
  const [notice, setNotice] = useState('')
  const [members, setMembers] = useState<Member[]>(defaultMembers)
  const [teams, setTeams] = useState<Team[]>(defaultTeams)
  const [assets, setAssets] = useState<BrandAsset[]>(defaultBrandAssets)
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings)
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [youtube, setYoutube] = useState<YouTubeSettings>({ channelId: '', maxVideos: 5 })
  const [websiteContent, setWebsiteContent] = useState<WebsiteContent>(defaultWebsiteContent)
  const [creatorHub, setCreatorHub] = useState<CreatorHubData>(defaultCreatorHub)
  const [membersDirty, setMembersDirty] = useState(false)
  const [discordDirtyMemberIds, setDiscordDirtyMemberIds] = useState<Set<string>>(new Set())
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([])
  const [memberCreateRequest, setMemberCreateRequest] = useState(0)
  const [hqMenuOpen, setHqMenuOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [previewRole, setPreviewRole] = useState<AdminRole | null>(null)
  const [recruitmentPositions, setRecruitmentPositions] = useState<RecruitmentPosition[]>(defaultRecruitmentPositions)
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>(defaultServiceProviders)
  const [creativeServices, setCreativeServices] = useState<CreativeService[]>(defaultCreativeServices)
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([])
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([])
  const [discordSettings, setDiscordSettings] = useState<DiscordSettings>({
    guildId:'',announcementsChannelId:'',teamRoleId:'',allowEveryone:false,allowTeam:true,
    sixRoleId:'1376636913276026880',ownershipRoleId:'1495855572564578414',
    sniperLeadRoleId:'1467699986434359440',sniperRecruitmentRoleId:'1377638920325562419',sniperTeamRoleId:'1376636834460864593',
    contentLeadRoleId:'1437896527069839450',contentTeamRoleId:'1376675519222779984',
    warzoneLeadRoleId:'1399451779032158362',warzoneTeamRoleId:'1376637068230529066',
    regLeadRoleId:'1399451180446519302',regTeamRoleId:'1395805851687846030',
    trialRoleId:'1380551910754615368',editorRoleId:'1378065312909492294',
    comRoleId:'1376637103223607316',verifiedRoleId:'1376684395855089724',unverifiedRoleId:'1376698136021569627',boostRoleId:'1377056559900655647',
    teamRoleIds:{sniper:'1376636834460864593',content:'1376675519222779984',warzone:'1376637068230529066',reg:'1395805851687846030',editors:'1378065312909492294'},autoSyncMembers:false
  })

  useEffect(() => {
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        location.href = '/login/'
        return
      }
      const { data } = await supabase
        .from('admin_profiles')
        .select('display_name,email,role,active')
        .eq('user_id', user.id)
        .single()
      if (!data?.active) {
        setNotice('This account is awaiting Owner approval.')
        setReady(true)
        return
      }
      setProfile(data)
      if(data.role==='social_media_manager') setTab('newsroom')
      const [loadedMembers, loadedTeams, loadedAssets, loadedSettings, loadedGallery, loadedYoutube, loadedWebsiteContent, loadedCreatorHub, loadedRecruitment, loadedProviders, loadedServices, loadedActivity, loadedNews, loadedDiscord] = await Promise.all([
        loadMembers(),
        loadTeams(),
        loadBrandAssets(),
        loadSettings(),
        loadGallery(),
        loadYouTube(),
        loadWebsiteContent(),
        loadCreatorHub(),
        loadRecruitmentPositions(),
        loadServiceProviders(),
        loadCreativeServices(),
        loadActivityFeed(),
        loadNewsArticles(),
        loadDiscordSettings(),
      ])
      setMembers(loadedMembers)
      setTeams(loadedTeams)
      setAssets(loadedAssets)
      setSettings(loadedSettings)
      setGallery(loadedGallery)
      setYoutube(loadedYoutube)
      setWebsiteContent(loadedWebsiteContent)
      setCreatorHub(loadedCreatorHub)
      setRecruitmentPositions(loadedRecruitment)
      setServiceProviders(loadedProviders)
      setCreativeServices(loadedServices)
      setActivityFeed(loadedActivity)
      setNewsArticles(loadedNews)
      setDiscordSettings(loadedDiscord)
      const requests = await loadChangeRequests().catch(() => [])
      setChangeRequests(requests)
      setReady(true)
    })()
  }, [])


  useEffect(() => {
    document.body.style.overflow = hqMenuOpen ? 'hidden' : ''
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setHqMenuOpen(false)
    document.addEventListener('keydown', close)
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', close) }
  }, [hqMenuOpen])

  useEffect(() => {
    if (!notificationOpen) return
    document.body.classList.add('notification-open')
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setNotificationOpen(false)
    document.addEventListener('keydown', close)
    return () => { document.body.classList.remove('notification-open'); document.removeEventListener('keydown', close) }
  }, [notificationOpen])

  const realIsSuperUser = profile?.role === 'owner' || profile?.role === 'super_user'
  const effectiveRole: AdminRole = previewRole || profile?.role || 'website_admin'
  const isSuperUser = effectiveRole === 'owner' || effectiveRole === 'super_user'
  const isSocialManager = effectiveRole === 'social_media_manager'
  const canApprove = isSuperUser
  const can = (section: string) => {
    if (isSuperUser || effectiveRole === 'website_admin') return true
    if (isSocialManager) return ['newsroom','recruitment','media'].includes(section)
    if (effectiveRole === 'content_lead') {
      return ['members', 'teams', 'tracking', 'media', 'brandAssets', 'reports', 'recruitment', 'services'].includes(section)
    }
    return false
  }
  const canView = (section: string) => {
    if (section === 'admins' || section === 'integrations') return isSuperUser
    if (section === 'settings') return true
    if (section === 'website') return isSuperUser || effectiveRole === 'website_admin'
    if (section === 'brandAssets' && isSocialManager) return true
    if (section === 'media' && isSocialManager) return true
    if (isSocialManager) return ['overview','newsroom','recruitment','media','brandAssets'].includes(section)
    if (section === 'approvals') return isSuperUser || effectiveRole === 'website_admin' || effectiveRole === 'content_lead'
    if (section === 'activity') return !isSocialManager
    return section === 'overview' || can(section)
  }

  async function persist(section: string, data: unknown) {
    if (previewRole) { setNotice('Role Preview is read-only. Exit preview to make changes.'); return }
    try {
      if (isSuperUser) {
        await saveSection(section, data)
        setNotice('Published successfully.')
      } else {
        await submitChange(section, data)
        setNotice('Submitted to Pxddy for approval. Nothing has changed publicly yet.')
        setChangeRequests(await loadChangeRequests())
      }
      await recordActivity(isSuperUser ? 'published_section' : 'submitted_change', section, { section })
      setActivityFeed(await loadActivityFeed())
      if (section === 'members') setMembersDirty(false)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Save failed')
    }
  }

  function markDiscordDirty(memberId:string){
    setDiscordDirtyMemberIds(current=>{const next=new Set(current);next.add(memberId);return next})
  }

  function updateMember(memberId: string, patch: Partial<Member>) {
    setMembers((current) => current.map((member) => (member.id === memberId ? { ...member, ...patch } : member)))
    setMembersDirty(true)
    markDiscordDirty(memberId)
  }

  function addMember(member: Member) {
    setMembers((current) => [...current, member])
    setMembersDirty(true)
    markDiscordDirty(member.id)
  }

  function toggleTeam(memberId: string, teamId: string, checked: boolean) {
    const member = members.find((item) => item.id === memberId)
    if (!member) return
    const memberships = checked
      ? [...member.memberships, { teamId, role: 'member' as TeamRole, sortOrder: 99 }]
      : member.memberships.filter((item) => item.teamId !== teamId)
    updateMember(memberId, { memberships })
  }

  function updateMembership(
    memberId: string,
    teamId: string,
    patch: { role?: TeamRole; sortOrder?: number },
  ) {
    const member = members.find((item) => item.id === memberId)
    if (!member) return
    updateMember(memberId, {
      memberships: member.memberships.map((item) =>
        item.teamId === teamId ? { ...item, ...patch } : item,
      ),
    })
  }

  async function syncChangedMembers(ids:string[], mode:'sync'|'remove'='sync') {
    if (!discordSettings.autoSyncMembers && mode==='sync') return
    for (const id of ids) {
      const member=members.find(item=>item.id===id)
      if (!member?.discordUserId?.trim()) continue
      try { await syncMemberDiscord(id, member.leftV6?'remove':mode) }
      catch(error){ setNotice(`${member.name}: ${error instanceof Error?error.message:'Discord sync failed.'}`) }
    }
  }

  async function saveMembersAndSync(){
    await persist('members',members)
    if(isSuperUser){
      const ids=Array.from(discordDirtyMemberIds)
      await syncChangedMembers(ids)
    }
    setDiscordDirtyMemberIds(new Set())
  }

  async function removeMemberFromV6(memberId:string){
    if(!realIsSuperUser||previewRole){setNotice('Exit Role Preview before removing someone from V6.');return}
    const member=members.find(item=>item.id===memberId);if(!member)return
    const next=members.map(item=>item.id===memberId?{...item,active:false,leftV6:true,memberships:[]}:item)
    try{
      await saveSection('members',next)
      setMembers(next);setMembersDirty(false);setDiscordDirtyMemberIds(new Set())
      if(member.discordUserId?.trim()) await syncMemberDiscord(memberId,'remove')
      await recordActivity('member_removed_from_v6','members',{member_id:memberId,name:member.name})
      setNotice(`${member.name} removed from V6. Discord reset to Com + Verified.`)
    }catch(error){setNotice(error instanceof Error?error.message:'Remove from V6 failed.')}
  }

  async function uploadProfileImage(memberId: string, file: File) {
    const member = members.find((item) => item.id === memberId)
    if (!member) return
    setNotice('Uploading profile image…')
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `profiles/${member.id}-${Date.now()}-${safe}`
    const upload = await supabase.storage
      .from('public-media')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upload.error) {
      setNotice(upload.error.message)
      return
    }
    const { data } = supabase.storage.from('public-media').getPublicUrl(path)
    updateMember(memberId, { profileImage: data.publicUrl })
    setNotice('Profile image uploaded. Save members to publish.')
  }

  function addTeam() {
    const name = prompt('Team name')
    if (!name) return
    setTeams((current) => [
      ...current,
      {
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        publicName: name,
        sortOrder: current.length + 1,
        active: true,
      },
    ])
  }

  async function uploadAsset(asset: BrandAsset, file: File) {
    setNotice('Uploading…')
    const version = asset.storagePath ? nextVersion(asset.version) : '1.0'
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `${asset.id}/v${version}/${Date.now()}-${safe}`
    const upload = await supabase.storage
      .from('brand-downloads')
      .upload(path, file, { upsert: false, contentType: file.type || undefined })
    if (upload.error) {
      setNotice(upload.error.message)
      return
    }
    const now = new Date().toISOString()
    const updated = assets.map((item) =>
      item.id === asset.id
        ? {
            ...item,
            version,
            status: 'Published',
            updated: now,
            storagePath: path,
            filename: file.name,
            fileSize: file.size,
            history: [
              ...(item.history || []),
              ...(item.storagePath && item.updated && item.filename
                ? [{ version: item.version, storagePath: item.storagePath, filename: item.filename, updated: item.updated, fileSize: item.fileSize }]
                : []),
            ],
          }
        : item,
    )
    setAssets(updated)
    await persist('brandAssets', updated)
  }

  async function downloadBrandAsset(asset:BrandAsset){
    if(!asset.storagePath){setNotice('This asset has not been uploaded yet.');return}
    const {data,error}=await supabase.storage.from('brand-downloads').createSignedUrl(asset.storagePath,60,{download:asset.filename||true})
    if(error){setNotice(error.message);return}
    window.location.href=data.signedUrl
  }

  async function uploadGalleryFiles(files: FileList) {
    setNotice('Uploading gallery images…')
    const additions: GalleryItem[] = []
    for (const file of Array.from(files)) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `gallery/${Date.now()}-${crypto.randomUUID()}-${safe}`
      const upload = await supabase.storage.from('public-media').upload(path, file, { contentType: file.type, upsert: false })
      if (upload.error) { setNotice(upload.error.message); return }
      const { data } = supabase.storage.from('public-media').getPublicUrl(path)
      additions.push({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), imageUrl: data.publicUrl, published: true, sortOrder: gallery.length + additions.length + 1, storagePath: path })
    }
    const next = [...gallery, ...additions]
    setGallery(next)
    await persist('gallery', next)
  }

  function updateGalleryItem(id: string, patch: Partial<GalleryItem>) {
    setGallery((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  function moveGalleryItem(id: string, direction: -1 | 1) {
    setGallery((current) => {
      const ordered = [...current].sort((a,b) => a.sortOrder - b.sortOrder)
      const index = ordered.findIndex((item) => item.id === id)
      const swap = index + direction
      if (index < 0 || swap < 0 || swap >= ordered.length) return current
      ;[ordered[index], ordered[swap]] = [ordered[swap], ordered[index]]
      return ordered.map((item, position) => ({ ...item, sortOrder: position + 1 }))
    })
  }

  async function uploadBrandImage(kind: 'logo' | 'banner', file: File) {
    const path = `website/${kind}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const upload = await supabase.storage
      .from('public-media')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upload.error) {
      setNotice(upload.error.message)
      return
    }
    const { data } = supabase.storage.from('public-media').getPublicUrl(path)
    const next = { ...settings, [kind]: data.publicUrl }
    setSettings(next)
    await persist('settings', next)
  }

  const activeCount = useMemo(() => members.filter((member) => member.active).length, [members])

  if (!ready)
    return (
      <main className="admin-page hq-page hq-loading-page" aria-busy="true">
        <aside className="admin-sidebar hq-sidebar hq-loading-sidebar">
          <div className="skeleton skeleton-brand" />
          {Array.from({ length: 8 }).map((_, index) => <div className="skeleton skeleton-nav" key={index} />)}
        </aside>
        <section className="admin-content hq-content hq-loading-content">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-hero" />
          <div className="skeleton skeleton-panel" />
          <div className="skeleton-grid">{Array.from({ length: 4 }).map((_, index) => <div className="skeleton skeleton-stat" key={index} />)}</div>
        </section>
      </main>
    )

  if (!profile)
    return (
      <main className="join-shell">
        <div className="join-card">
          <h2>Access pending</h2>
          <p>{notice}</p>
          <button
            className="btn btn-secondary"
            onClick={() => supabase.auth.signOut().then(() => (location.href = '/login/'))}
          >
            Sign out
          </button>
        </div>
      </main>
    )

  const pendingApprovalCount = changeRequests.filter((item) => item.status === 'pending').length
  const navigationGroups = [
    { id:'dashboard', label:'Dashboard', items:[
      {id:'overview',label:'Overview'},
      ...(canView('approvals')?[{id:'approvals',label:`Pending Approvals${pendingApprovalCount?` (${pendingApprovalCount})`:''}`}]:[]),
    ]},
    { id:'people', label:'People & Teams', items:[
      {id:'members',label:'Members'},{id:'teams',label:'Teams'},{id:'tracking',label:'Creator Tracking'},
    ]},
    { id:'content', label:'Content', items:[
      {id:'newsroom',label:'Newsroom'},{id:'media',label:'Media'},{id:'brandAssets',label:'Brand Pack'},
    ]},
    { id:'recruitment-services', label:'Recruitment & Services', items:[
      {id:'recruitment',label:'Recruitment'},{id:'services',label:'Services'},
    ]},
    { id:'website-group', label:'Website', items:[
      {id:'website',label:'Website CMS & Settings'},
    ]},
    { id:'reports-activity', label:'Reports & Activity', items:[
      {id:'reports',label:'Reports'},{id:'activity',label:'Activity Feed'},
    ]},
    { id:'integrations-group', label:'Integrations', items:[
      {id:'integrations',label:'Integrations'},
    ]},
    { id:'administration', label:'Administration', items:[
      {id:'admins',label:'Administrators'},
    ]},
    { id:'settings-group', label:'Settings', items:[
      {id:'settings',label:'My Account & Password'},
    ]},
  ].map(group=>({...group,items:group.items.filter(item=>canView(item.id))})).filter(group=>group.items.length)
  const navigation = navigationGroups.flatMap(group=>group.items)


  return (
    <main className="admin-page hq-page">
      <aside className={`admin-sidebar hq-sidebar ${hqMenuOpen ? 'mobile-open' : ''}`}>
        <div className="hq-brand">
          <img src="/assets/v6-logo.png" alt="v6" />
          <span>
            <strong>V6 HQ</strong>
            <small>Competitive Gaming Organisation</small>
          </span>
        </div>
        <nav aria-label="V6 HQ navigation" className="hq-grouped-nav">
          {navigationGroups.map((group) => (
            <details className="hq-nav-group" key={group.id} open={group.items.some(item=>item.id===tab) || group.id==='dashboard'}>
              <summary>{group.label}<span>⌄</span></summary>
              <div>
                {group.items.map((item)=>(
                  <button key={item.id} className={tab===item.id?'active':''} onClick={()=>{setTab(item.id);setHqMenuOpen(false);window.scrollTo({top:0,behavior:'smooth'})}}>{item.label}</button>
                ))}
              </div>
            </details>
          ))}
        </nav>
        <div className="hq-sidebar-footer">
          <small>v3.11.3 · Connected</small>
          <button onClick={() => supabase.auth.signOut().then(() => (location.href = '/login/'))}>
            Sign out
          </button>
        </div>
      </aside>
      {hqMenuOpen && <button className="hq-mobile-scrim" aria-label="Close HQ menu" onClick={()=>setHqMenuOpen(false)}/>}

      <section className={`admin-content hq-content ${previewRole?'role-preview-readonly':''}`}>
        <header>
          <button className="hq-mobile-menu-button" onClick={()=>setHqMenuOpen(true)} aria-label="Open HQ navigation"><span/><span/><span/></button>
          <div>
            <div className="eyebrow">{previewRole?`Role preview · ${effectiveRole.replaceAll('_',' ')}`:(profile.role === 'owner' ? 'Primary super user' : profile.role.replaceAll('_', ' '))}</div>
            <h1>{navigation.find((item) => item.id === tab)?.label || 'V6 HQ'}</h1>
          </div>
          <div className="hq-header-actions">
            {realIsSuperUser&&<div className="role-preview-control"><label>View as<select value={previewRole||''} onChange={(e)=>{const role=(e.target.value||null) as AdminRole|null;setPreviewRole(role);if(role==='social_media_manager')setTab('newsroom');else if(role)setTab('overview')}}><option value="">My Super User view</option><option value="website_admin">Administrator</option><option value="content_lead">Content Lead</option><option value="social_media_manager">Social Media Manager</option></select></label>{previewRole&&<button className="btn btn-secondary" onClick={()=>{setPreviewRole(null);setTab('overview')}}>Exit Preview</button>}</div>}
{!isSocialManager&&<div className="hq-notification-wrap"><button className="hq-notification" onClick={()=>setNotificationOpen((value)=>!value)} aria-label="Open notifications" aria-expanded={notificationOpen}>🔔<span>{changeRequests.filter((item)=>item.status==='pending').length + members.filter((member)=>member.active && member.memberships.some((membership)=>creatorHub.trackedTeamIds.includes(membership.teamId)) && creatorStatus(member.id,creatorHub,members)==='review-required').length}</span></button>{notificationOpen&&<><button className="hq-notification-scrim" aria-label="Close notifications" onClick={()=>setNotificationOpen(false)}/><div className="hq-notification-panel"><div className="hq-notification-title"><strong>Notifications</strong><button aria-label="Close notifications" onClick={()=>setNotificationOpen(false)}>×</button></div><button onClick={()=>{setTab('approvals');setNotificationOpen(false)}}><b>{changeRequests.filter((item)=>item.status==='pending').length}</b><span>Pending approvals</span></button><button onClick={()=>{setTab('tracking');setNotificationOpen(false)}}><b>{members.filter((member)=>member.active && member.memberships.some((membership)=>creatorHub.trackedTeamIds.includes(membership.teamId)) && creatorStatus(member.id,creatorHub,members)==='review-required').length}</b><span>Creator reviews</span></button><button onClick={()=>{setTab('brandAssets');setNotificationOpen(false)}}><b>{assets.filter((asset)=>!asset.storagePath).length}</b><span>Assets awaiting upload</span></button><button onClick={()=>{setTab('recruitment');setNotificationOpen(false)}}><b>{recruitmentPositions.filter(item=>item.status==='open').length}</b><span>Open positions</span></button></div></>}</div>}{notice && <div className="team-toast" role="status">✓ {notice}</div>}</div>
        </header>
        {previewRole&&<div className="role-preview-banner"><strong>ROLE PREVIEW — {effectiveRole.replaceAll('_',' ')}</strong><span>You are still signed in as Super User. This preview is read-only.</span><button onClick={()=>{setPreviewRole(null);setTab('overview')}}>Exit Preview</button></div>}

        {tab === 'overview' && (isSocialManager ? <SmmDashboard setTab={setTab} pendingMedia={changeRequests.filter(r=>r.section==='gallery'&&r.status==='pending').length} /> : (
          <div className="hq-dashboard hq-command-centre">
            <section className="hq-welcome">
              <div>
                <div className="eyebrow">V6 command centre</div>
                <h2>Hello, {profile.display_name || 'Admin'}.</h2>
                <p>Here is what needs your attention across the organisation today.</p>
              </div>
              <div className="hq-live-pill"><span/> Website live</div>
            </section>

            <section className="hq-priority-panel">
              <div className="admin-section-head">
                <div>
                  <div className="eyebrow">Today's priorities</div>
                  <h2>Needs attention</h2>
                </div>
              </div>
              <div className="hq-priority-list">
                <button onClick={() => setTab('approvals')} data-state={changeRequests.filter((item) => item.status === 'pending').length ? 'warning' : 'clear'}>
                  <span className="hq-priority-dot"/>
                  <div><strong>{changeRequests.filter((item) => item.status === 'pending').length} pending approval{changeRequests.filter((item) => item.status === 'pending').length === 1 ? '' : 's'}</strong><small>{changeRequests.filter((item) => item.status === 'pending').length ? 'Review changes submitted by administrators.' : 'No approval requests are waiting.'}</small></div>
                  <b>Open</b>
                </button>
                <button onClick={() => setTab('tracking')} data-state={members.filter((member) => member.active && member.memberships.some((membership) => creatorHub.trackedTeamIds.includes(membership.teamId)) && creatorStatus(member.id, creatorHub, members) === 'review-required').length ? 'danger' : 'clear'}>
                  <span className="hq-priority-dot"/>
                  <div><strong>{members.filter((member) => member.active && member.memberships.some((membership) => creatorHub.trackedTeamIds.includes(membership.teamId)) && creatorStatus(member.id, creatorHub, members) === 'review-required').length} creator review{members.filter((member) => member.active && member.memberships.some((membership) => creatorHub.trackedTeamIds.includes(membership.teamId)) && creatorStatus(member.id, creatorHub, members) === 'review-required').length === 1 ? '' : 's'}</strong><small>{members.filter((member) => member.active && member.memberships.some((membership) => creatorHub.trackedTeamIds.includes(membership.teamId)) && creatorStatus(member.id, creatorHub, members) === 'review-required').length ? 'Creator activity needs checking.' : 'Creator activity is up to date.'}</small></div>
                  <b>Open</b>
                </button>
                <button onClick={() => setTab('media')} data-state={youtube.channelId ? 'clear' : 'warning'}>
                  <span className="hq-priority-dot"/>
                  <div><strong>{youtube.channelId ? 'YouTube connected' : 'YouTube needs connecting'}</strong><small>{gallery.filter((item) => item.published).length} gallery item{gallery.filter((item) => item.published).length === 1 ? '' : 's'} currently published.</small></div>
                  <b>Open</b>
                </button>
              </div>
            </section>

            <div className="admin-stats hq-stats">
              <button onClick={() => setTab('members')}><strong>{activeCount}</strong><span>Active members</span></button>
              <button onClick={() => setTab('teams')}><strong>{teams.filter((team) => team.active).length}</strong><span>Public teams</span></button>
              <button onClick={() => setTab('tracking')}><strong>{members.filter((member) => member.active && member.memberships.some((membership) => creatorHub.trackedTeamIds.includes(membership.teamId))).length}</strong><span>Tracked creators</span></button>
              <button onClick={() => setTab('media')}><strong>{gallery.filter((item) => item.published).length}</strong><span>Published media</span></button>
            </div>

            <section className="hq-dashboard-columns">
              <div className="hq-quick-actions admin-panel">
                <div className="admin-section-head"><div><div className="eyebrow">Workspace</div><h2>Quick actions</h2></div></div>
                <div className="hq-action-grid">
                  {can('members') && <button onClick={() => { setTab('members'); setMemberCreateRequest((value) => value + 1) }}>+ Add member</button>}
                  {can('media') && <button onClick={() => setTab('media')}>Upload media</button>}
                  {can('brandAssets') && <button onClick={() => setTab('brandAssets')}>Upload brand asset</button>}
                  {isSuperUser && <button onClick={() => setTab('admins')}>Invite admin</button>}
                  {can('website') && <button onClick={() => setTab('website')}>Edit website</button>}
                  {can('tracking') && <button onClick={() => setTab('tracking')}>Open creator hub</button>}
                  {can('recruitment') && <button onClick={() => setTab('recruitment')}>Manage recruitment</button>}
                </div>
              </div>

              <div className="hq-recent-activity admin-panel">
                <div className="admin-section-head"><div><div className="eyebrow">Organisation</div><h2>Recent activity</h2></div></div>
                <div className="hq-activity-list">
                  {activityFeed.slice(0, 7).map((event) => <button key={event.id} onClick={() => setTab('activity')}><span className="hq-activity-status approved"/><div><strong>{activityLabel(event)}</strong><small>{new Date(event.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · View full activity</small></div></button>)}{!activityFeed.length && <div className="hq-empty-state"><strong>No recent activity</strong><small>Published changes and management actions will appear here.</small></div>}
                </div>
              </div>
            </section>

            <section className="admin-panel hq-status hq-system-strip">
              <div><span>Platform</span><strong className="hq-status-ok">Connected</strong></div>
              <div><span>Current release</span><strong>v3.11.3</strong></div>
              <div><span>Signed in as</span><strong>{profile.display_name || 'Admin'}</strong></div>
            </section>
          </div>
        ))}

        {tab === 'approvals' && (
          <ApprovalCentre
            role={effectiveRole}
            requests={changeRequests}
            currentSections={{ members, teams, brandAssets: assets, settings, gallery, youtube, websiteContent, creatorHub, recruitmentPositions, serviceProviders, creativeServices, newsArticles }}
            refresh={async () => setChangeRequests(await loadChangeRequests())}
            review={async (request, decision, note) => {
              try {
                await reviewChange(request, decision, note)
                setNotice(decision === 'approved' ? 'Approved and published.' : 'Review saved.')
                setChangeRequests(await loadChangeRequests())
                if (decision === 'approved') {
                  const [loadedMembers, loadedTeams, loadedAssets, loadedSettings, loadedGallery, loadedYoutube, loadedWebsiteContent, loadedCreatorHub, loadedRecruitment, loadedProviders, loadedServices, loadedActivity, loadedNews, loadedDiscord] = await Promise.all([
                    loadMembers(),
                    loadTeams(),
                    loadBrandAssets(),
                    loadSettings(),
                    loadGallery(),
                    loadYouTube(),
                    loadWebsiteContent(),
                    loadCreatorHub(),
                    loadRecruitmentPositions(),
                    loadServiceProviders(),
                    loadCreativeServices(),
                    loadActivityFeed(),
                    loadNewsArticles(),
                    loadDiscordSettings(),
                  ])
                  if(request.section==='members'&&discordSettings.autoSyncMembers){
                    const changedIds=loadedMembers.filter((nextMember:any)=>{const before=members.find(item=>item.id===nextMember.id);return JSON.stringify(before)!==JSON.stringify(nextMember)}).map((item:any)=>item.id)
                    for(const id of changedIds){const changed=loadedMembers.find((item:any)=>item.id===id);if(changed?.discordUserId?.trim()){try{await syncMemberDiscord(id,changed.leftV6?'remove':'sync')}catch{}}}
                  }
                  setMembers(loadedMembers); setTeams(loadedTeams); setAssets(loadedAssets); setSettings(loadedSettings); setGallery(loadedGallery); setYoutube(loadedYoutube); setWebsiteContent(loadedWebsiteContent); setCreatorHub(loadedCreatorHub); setRecruitmentPositions(loadedRecruitment); setServiceProviders(loadedProviders); setCreativeServices(loadedServices); setActivityFeed(loadedActivity); setNewsArticles(loadedNews)
      setDiscordSettings(loadedDiscord)
                }
              } catch (error) {
                setNotice(error instanceof Error ? error.message : 'Review failed')
              }
            }}
          />
        )}

        {tab === 'members' && (
          <MembersCMS
            members={members}
            teams={teams}
            canEdit={can('members')}
            dirty={membersDirty}
            addMember={addMember}
            createRequest={memberCreateRequest}
            updateMember={updateMember}
            toggleTeam={toggleTeam}
            updateMembership={updateMembership}
            uploadProfileImage={uploadProfileImage}
            save={saveMembersAndSync}
            discordEveryoneAllowed={discordSettings.allowEveryone}
            discordAutoSyncEnabled={discordSettings.autoSyncMembers}
            isSuperUser={isSuperUser}
            removeMemberFromV6={removeMemberFromV6}
          />
        )}

        {tab === 'teams' && (
          <TeamManager
            teams={teams}
            setTeams={setTeams}
            members={members}
            canEdit={can('members')}
            toggleTeam={toggleTeam}
            updateMembership={updateMembership}
            save={() => persist('teams', teams)}
            saveMembers={saveMembersAndSync}
          />
        )}

        {tab === 'brandAssets' && canView('brandAssets') && (
          <div>
            <div className="admin-section-head">
              <div><h2>Brand Pack</h2><p>{isSocialManager?'Approved V6 assets — read and download only.':'Five official assets with automatic version history.'}</p></div>
              {isSocialManager&&<a className="btn btn-secondary" href="/brand-pack" target="_blank" rel="noreferrer">Open public Brand Pack ↗</a>}
            </div>
            <div className="admin-grid brand-admin-grid">
              {assets.map((asset) => (
                <details className={`admin-panel brand-admin-card ${asset.storagePath ? 'is-ready' : 'is-missing'}`} key={asset.id}>
                  <summary>
                    <div className="brand-admin-card-title"><div className="eyebrow">{asset.category}</div><h3>{asset.name}</h3><small>{asset.storagePath ? 'Available in the public Brand Pack' : 'Upload required before this asset is public'}</small></div>
                    <span className={asset.storagePath ? 'asset-live' : 'asset-missing'}>{asset.storagePath ? `Version ${asset.version}` : 'Awaiting upload'}</span>
                  </summary>
                  <div className="brand-admin-meta"><span>{asset.updated ? `Updated ${new Date(asset.updated).toLocaleDateString('en-GB')}` : asset.status}</span>{asset.filename && <span>{asset.filename}{asset.fileSize ? ` · ${(asset.fileSize/1024/1024).toFixed(1)} MB` : ''}</span>}</div>
                  <div className="brand-admin-actions">{asset.storagePath&&<button className="btn btn-secondary" onClick={()=>downloadBrandAsset(asset)}>Download</button>}{can('brandAssets')&&<label className="btn btn-primary brand-upload-action">{asset.storagePath ? 'Upload new version' : 'Upload asset'}<input hidden type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files?.[0] && uploadAsset(asset, event.target.files[0])}/></label>}</div>
                  {isSocialManager&&<small className="readonly-note">Read/download only — Brand Pack source files are protected.</small>}
                  {(asset.history || []).length > 0 && <div className="asset-history"><h4>Previous versions</h4>{[...(asset.history || [])].reverse().map((version) => <div key={`${asset.id}-${version.version}-${version.updated}`}><span>v{version.version} · {new Date(version.updated).toLocaleDateString('en-GB')}</span><small>{version.filename}</small></div>)}</div>}
                </details>
              ))}
            </div>
          </div>
        )}

        {tab === 'website' && can('website') && (
          <WebsiteCMS
            settings={settings}
            setSettings={setSettings}
            content={websiteContent}
            setContent={setWebsiteContent}
            persist={persist}
            uploadBrandImage={uploadBrandImage}
          />
        )}

        {tab === 'tracking' && can('tracking') && (
          <CreatorHub
            data={creatorHub}
            setData={setCreatorHub}
            members={members}
            teams={teams}
            persist={persist}
            onNotice={setNotice}
          />
        )}
        {tab === 'media' && canView('media') && (
          isSocialManager
            ? <SocialMediaContributions liveGallery={gallery} requests={changeRequests} onNotice={setNotice} refreshRequests={async()=>setChangeRequests(await loadChangeRequests())} previewMode={Boolean(previewRole)}/>
            : <div className="media-manager">
                <div className="admin-section-head"><div><h2>Media Suite</h2><p>Manage the public gallery and latest five YouTube uploads.</p></div></div>
                <section className="admin-panel media-youtube-settings">
                  <div><div className="eyebrow">YouTube</div><h3>Latest uploads feed</h3><p>Paste the channel ID, not the @handle. The public page will always show the newest five videos.</p></div>
                  <label>Channel ID<input value={youtube.channelId} placeholder="UC…" onChange={(event)=>setYoutube({...youtube, channelId:event.target.value.trim()})}/></label>
                  <label>Videos shown<input type="number" min="1" max="5" value={youtube.maxVideos} onChange={(event)=>setYoutube({...youtube,maxVideos:Math.min(5,Math.max(1,Number(event.target.value)))})}/></label>
                  <button className="btn btn-primary" onClick={()=>persist('youtube',youtube)}>Save YouTube feed</button>
                </section>
                <div className="admin-section-head gallery-heading"><div><h2>Image Gallery</h2><p>{gallery.length} images · {gallery.filter(item=>item.published).length} published</p></div><label className="btn btn-primary">Upload images<input hidden multiple type="file" accept="image/*" onChange={(event)=>event.target.files && uploadGalleryFiles(event.target.files)}/></label></div>
                <div className="gallery-admin-list">
                  {[...gallery].sort((a,b)=>a.sortOrder-b.sortOrder).map((item,index)=><article className="admin-panel gallery-admin-item" key={item.id}>
                    <img src={item.imageUrl} alt=""/>
                    <div className="gallery-admin-fields"><label>Title<input value={item.title} onChange={(event)=>updateGalleryItem(item.id,{title:event.target.value})}/></label><label>Caption<textarea value={item.caption||''} onChange={(event)=>updateGalleryItem(item.id,{caption:event.target.value})}/></label><label className="inline-check"><input type="checkbox" checked={item.published} onChange={(event)=>updateGalleryItem(item.id,{published:event.target.checked})}/>Published</label></div>
                    <div className="gallery-admin-actions"><button disabled={index===0} onClick={()=>moveGalleryItem(item.id,-1)}>↑</button><button disabled={index===gallery.length-1} onClick={()=>moveGalleryItem(item.id,1)}>↓</button><button className="danger-button" onClick={()=>setGallery(current=>current.filter(entry=>entry.id!==item.id))}>Remove</button></div>
                  </article>)}
                  {gallery.length===0 && <div className="admin-panel member-empty-state"><h3>No gallery images yet</h3><p>Upload several images at once to create the public carousel.</p></div>}
                </div>
                {gallery.length>0 && <div className="admin-actions gallery-save"><button className="btn btn-primary" onClick={()=>persist('gallery',gallery)}>Save gallery changes</button></div>}
              </div>
        )}

        {tab === 'newsroom' && can('newsroom') && <NewsroomManager articles={newsArticles} setArticles={setNewsArticles} discordSettings={discordSettings} setDiscordSettings={setDiscordSettings} teams={teams} isSuperUser={isSuperUser} isSocialManager={isSocialManager} onNotice={setNotice} refreshApprovals={async()=>setChangeRequests(await loadChangeRequests())} />}
        {tab === 'services' && can('services') && <ServicesManager providers={serviceProviders} setProviders={setServiceProviders} services={creativeServices} setServices={setCreativeServices} persist={persist} onNotice={setNotice} />}
        {tab === 'recruitment' && can('recruitment') && <RecruitmentManager positions={recruitmentPositions} setPositions={setRecruitmentPositions} websiteContent={websiteContent} persist={persist} onNotice={setNotice} isSocialManager={isSocialManager} refreshApprovals={async()=>setChangeRequests(await loadChangeRequests())} />}
        {tab === 'integrations' && isSuperUser && <IntegrationsManager discordSettings={discordSettings} setDiscordSettings={setDiscordSettings} teams={teams} onNotice={setNotice} previewMode={Boolean(previewRole)}/>}
        {tab === 'activity' && <ActivityFeed events={activityFeed} refresh={async()=>setActivityFeed(await loadActivityFeed())} />}
        {tab === 'reports' && can('reports') && (
          <CreatorReports data={creatorHub} members={members} teams={teams} assets={assets} gallery={gallery} requests={changeRequests} />
        )}
        {tab === 'settings' && isSuperUser && <AccountSecurity onNotice={setNotice} />}
        {tab === 'admins' && isSuperUser && <AdminManager role={profile.role} email={profile.email} onNotice={setNotice} />}
      </section>
    </main>
  )
}


function SmmDashboard({setTab,pendingMedia}:{setTab:(tab:string)=>void;pendingMedia:number}){
  return <div className="hq-dashboard smm-dashboard">
    <section className="hq-welcome"><div><div className="eyebrow">Social workspace</div><h2>Social Media Manager</h2><p>Publish team news, manage recruitment posts, contribute media for approval and download approved brand assets.</p></div></section>
    <div className="smm-dashboard-grid">
      <button className="admin-panel" onClick={()=>setTab('newsroom')}><span>01</span><strong>Newsroom</strong><small>Create, edit and distribute website news.</small></button>
      <button className="admin-panel" onClick={()=>setTab('recruitment')}><span>02</span><strong>Recruitment</strong><small>Create and maintain open recruitment positions.</small></button>
      <button className="admin-panel" onClick={()=>setTab('media')}><span>03</span><strong>Media</strong><small>Submit gallery images for approval.{pendingMedia?` ${pendingMedia} pending.`:''}</small></button>
      <button className="admin-panel" onClick={()=>setTab('brandAssets')}><span>04</span><strong>Brand Pack</strong><small>View and download approved V6 assets.</small></button>
    </div>
  </div>
}


function IntegrationsManager({discordSettings,setDiscordSettings,teams,onNotice,previewMode}:{discordSettings:DiscordSettings;setDiscordSettings:Dispatch<SetStateAction<DiscordSettings>>;teams:Team[];onNotice:(message:string)=>void;previewMode:boolean}){
  const [integration,setIntegration]=useState<'discord'|'x'|'tiktok'|'walby'>('discord')
  const saveDiscordSettings=async()=>{
    if(previewMode){onNotice('Role Preview is read-only. Exit preview to change integrations.');return}
    try{await saveSection('discordSettings',discordSettings);onNotice('Discord integration settings saved.')}catch(error){onNotice(error instanceof Error?error.message:'Could not save Discord settings.')}
  }
  return <div className="integrations-page">
    <div className="admin-section-head"><div><div className="eyebrow">System connections</div><h2>Integrations</h2><p>Configure external services in one protected Super User area. Publishing controls stay inside the feature that uses them.</p></div></div>
    <div className="integration-tabs">
      <button className={integration==='discord'?'active':''} onClick={()=>setIntegration('discord')}><strong>Discord</strong><span>Connected</span></button>
      <button className={integration==='x'?'active':''} onClick={()=>setIntegration('x')}><strong>X / Twitter</strong><span>Planned</span></button>
      <button className={integration==='tiktok'?'active':''} onClick={()=>setIntegration('tiktok')}><strong>TikTok</strong><span>Planned</span></button>
      <button className={integration==='walby'?'active':''} onClick={()=>setIntegration('walby')}><strong>Walby-8</strong><span>Awaiting API</span></button>
    </div>
    {integration==='discord'&&<section className="admin-panel discord-settings-panel">
      <div className="admin-section-head"><div><div className="eyebrow">Discord</div><h3>Server & publishing</h3><p>These IDs define where HQ can publish and which Discord roles the member synchronisation engine is allowed to manage.</p></div><button className="btn btn-primary" disabled={previewMode} onClick={saveDiscordSettings}>Save Discord settings</button></div>
      <div className="recruitment-form">
        <label>Discord server / Guild ID<input value={discordSettings.guildId} onChange={e=>setDiscordSettings({...discordSettings,guildId:e.target.value.trim()})}/></label>
        <label>Team-Updates channel ID<input value={discordSettings.announcementsChannelId} onChange={e=>setDiscordSettings({...discordSettings,announcementsChannelId:e.target.value.trim()})}/></label>
        <label>News @team mention Role ID<input value={discordSettings.teamRoleId} onChange={e=>setDiscordSettings({...discordSettings,teamRoleId:e.target.value.trim()})}/></label>
        <label className="featured-toggle"><span><strong>Allow @team</strong><small>Allows Newsroom publishers to select the configured @team mention.</small></span><input type="checkbox" checked={discordSettings.allowTeam} onChange={e=>setDiscordSettings({...discordSettings,allowTeam:e.target.checked})}/><i/></label>
        <label className="featured-toggle"><span><strong>Allow @everyone</strong><small>Allows Newsroom and member welcome announcements to use @everyone.</small></span><input type="checkbox" checked={discordSettings.allowEveryone} onChange={e=>setDiscordSettings({...discordSettings,allowEveryone:e.target.checked})}/><i/></label>
      </div>
      <div className="integration-divider"/>
      <div className="admin-section-head"><div><div className="eyebrow">Member lifecycle</div><h3>Discord role map</h3><p>HQ is the source of truth for managed V6 roles. Protected roles are recognised but never automatically rewritten.</p></div></div>
      <div className="recruitment-form">
        <label>6ix<input value={discordSettings.sixRoleId} onChange={e=>setDiscordSettings({...discordSettings,sixRoleId:e.target.value.trim()})}/></label>
        <label>Com<input value={discordSettings.comRoleId} onChange={e=>setDiscordSettings({...discordSettings,comRoleId:e.target.value.trim()})}/></label>
        <label>Verified<input value={discordSettings.verifiedRoleId} onChange={e=>setDiscordSettings({...discordSettings,verifiedRoleId:e.target.value.trim()})}/></label>
        <div className="wide discord-role-map-grid">
          <label>Sniper Lead<input value={discordSettings.sniperLeadRoleId} onChange={e=>setDiscordSettings({...discordSettings,sniperLeadRoleId:e.target.value.trim()})}/></label>
          <label>Sniper Recruitment<input value={discordSettings.sniperRecruitmentRoleId} onChange={e=>setDiscordSettings({...discordSettings,sniperRecruitmentRoleId:e.target.value.trim()})}/></label>
          <label>6ix Trial<input value={discordSettings.trialRoleId} onChange={e=>setDiscordSettings({...discordSettings,trialRoleId:e.target.value.trim()})}/></label>
          <label>Content Lead<input value={discordSettings.contentLeadRoleId} onChange={e=>setDiscordSettings({...discordSettings,contentLeadRoleId:e.target.value.trim()})}/></label>
          <label>Warzone Lead<input value={discordSettings.warzoneLeadRoleId} onChange={e=>setDiscordSettings({...discordSettings,warzoneLeadRoleId:e.target.value.trim()})}/></label>
          <label>Reg Lead<input value={discordSettings.regLeadRoleId} onChange={e=>setDiscordSettings({...discordSettings,regLeadRoleId:e.target.value.trim()})}/></label>
          <label>Unverified — protected<input value={discordSettings.unverifiedRoleId} onChange={e=>setDiscordSettings({...discordSettings,unverifiedRoleId:e.target.value.trim()})}/></label>
          <label>Boost — protected<input value={discordSettings.boostRoleId} onChange={e=>setDiscordSettings({...discordSettings,boostRoleId:e.target.value.trim()})}/></label>
          <label>6ix Ownership — protected<input value={discordSettings.ownershipRoleId} onChange={e=>setDiscordSettings({...discordSettings,ownershipRoleId:e.target.value.trim()})}/></label>
        </div>
        <div className="wide discord-team-role-map"><h3>HQ team → Discord role mapping</h3><p>Defines the Discord role for each HQ team. Mappings are applied during a manual sync, or automatically only when Automatic Member Sync is enabled.</p>{teams.map(team=><label key={team.id}>{team.publicName}<input value={discordSettings.teamRoleIds?.[team.id]||''} onChange={e=>setDiscordSettings({...discordSettings,teamRoleIds:{...(discordSettings.teamRoleIds||{}),[team.id]:e.target.value.trim()}})}/></label>)}</div>
        <label className="featured-toggle"><span><strong>Automatic member sync</strong><small>When enabled, saving member/team changes immediately reconciles Discord. Keep this off while cleaning HQ data.</small></span><input type="checkbox" checked={discordSettings.autoSyncMembers} onChange={e=>setDiscordSettings({...discordSettings,autoSyncMembers:e.target.checked})}/><i/></label>
      </div>
      <p className="discord-security-note">The bot token remains in Netlify only. The bot needs Manage Roles and Manage Nicknames and must sit above the V6-managed roles.</p>
    </section>}
    {integration==='x'&&<section className="admin-panel integration-placeholder"><div className="eyebrow">X / Twitter</div><h3>Automatic social distribution</h3><p>Reserved for the future X connection. Article-level “Post to X” choices remain in Newsroom.</p></section>}
    {integration==='tiktok'&&<section className="admin-panel integration-placeholder"><div className="eyebrow">TikTok</div><h3>Creator activity connection</h3><p>Reserved for TikTok account linking and automatic Creator Tracking.</p></section>}
    {integration==='walby'&&<section className="admin-panel integration-placeholder"><div className="eyebrow">Walby-8</div><h3>Roster integration</h3><p>Parked until the Walby-8 owner confirms an API or supported external update method.</p></section>}
  </div>
}

function SocialMediaContributions({liveGallery,requests,onNotice,refreshRequests,previewMode}:{liveGallery:GalleryItem[];requests:ChangeRequest[];onNotice:(message:string)=>void;refreshRequests:()=>Promise<void>;previewMode:boolean}){
  const [userId,setUserId]=useState('')
  const [draft,setDraft]=useState<GalleryItem|null>(null)
  const [uploading,setUploading]=useState(false)
  const [submitting,setSubmitting]=useState(false)
  useEffect(()=>{supabase.auth.getUser().then(({data})=>setUserId(data.user?.id||''))},[])
  const ownRequests=requests.filter(request=>request.section==='gallery'&&(!userId||request.submitted_by===userId)).sort((a,b)=>b.submitted_at.localeCompare(a.submitted_at))
  const extractItem=(request:ChangeRequest)=>{
    const proposed=Array.isArray(request.proposed_data)?request.proposed_data as GalleryItem[]:[]
    const liveIds=new Set(liveGallery.map(item=>item.id))
    return [...proposed].reverse().find(item=>!liveIds.has(item.id))||proposed[proposed.length-1]
  }
  const startNew=()=>setDraft({id:crypto.randomUUID(),title:'',caption:'',imageUrl:'',published:true,sortOrder:liveGallery.length+1})
  const uploadImage=async(file:File)=>{
    if(previewMode){onNotice('Role Preview is read-only.');return}
    setUploading(true)
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-'),path=`gallery/pending-${Date.now()}-${crypto.randomUUID()}-${safe}`
    const upload=await supabase.storage.from('public-media').upload(path,file,{contentType:file.type,upsert:false})
    setUploading(false)
    if(upload.error){onNotice(upload.error.message);return}
    const {data}=supabase.storage.from('public-media').getPublicUrl(path)
    setDraft(current=>({...current||{id:crypto.randomUUID(),title:'',caption:'',published:true,sortOrder:liveGallery.length+1},imageUrl:data.publicUrl,storagePath:path,title:current?.title||file.name.replace(/\.[^.]+$/,'')}))
  }
  const submit=async()=>{
    if(previewMode){onNotice('Role Preview is read-only. Exit preview to submit media.');return}
    if(!draft?.imageUrl){onNotice('Upload an image first.');return}
    setSubmitting(true)
    try{
      const clean={...draft,published:true,sortOrder:liveGallery.length+1}
      await submitChange('gallery',[...liveGallery.filter(item=>item.id!==clean.id),clean])
      await refreshRequests()
      setDraft(null)
      onNotice('Media submitted for approval. It will not appear publicly until approved.')
    }catch(error){onNotice(error instanceof Error?error.message:'Media submission failed.')}
    finally{setSubmitting(false)}
  }
  const amend=(request:ChangeRequest)=>{const item=extractItem(request);if(item)setDraft(structuredClone(item))}
  return <div className="smm-media">
    <div className="admin-section-head"><div><div className="eyebrow">Content contribution</div><h2>Media</h2><p>Upload images for the public Media gallery. Every submission requires Admin approval before it becomes visible.</p></div><button className="btn btn-primary" disabled={previewMode} onClick={startNew}>+ Submit image</button></div>
    {draft&&<section className="admin-panel media-submission-editor">
      <div><div className="eyebrow">Submission draft</div><h3>{draft.imageUrl?'Review your image':'Add an image'}</h3></div>
      <div className="media-submission-grid">
        <div className="media-submission-preview">{draft.imageUrl?<img src={draft.imageUrl} alt=""/>:<span>No image selected</span>}<label className="btn btn-secondary">{uploading?'Uploading…':draft.imageUrl?'Replace image':'Upload image'}<input hidden type="file" accept="image/*" disabled={uploading||previewMode} onChange={e=>e.target.files?.[0]&&uploadImage(e.target.files[0])}/></label></div>
        <div><label>Title<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Caption<textarea rows={5} value={draft.caption||''} onChange={e=>setDraft({...draft,caption:e.target.value})}/></label><p className="approval-help">Submitting creates a Pending Approval request. The image is stored safely but remains hidden from the public site until approved.</p></div>
      </div>
      <div className="admin-actions"><button className="btn btn-secondary" onClick={()=>setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={submitting||!draft.imageUrl||previewMode} onClick={submit}>{submitting?'Submitting…':'Submit for approval'}</button></div>
    </section>}
    <section className="admin-panel">
      <div className="admin-section-head"><div><h3>My media submissions</h3><p>Rejected or change-requested submissions keep the original image and Admin feedback so you can amend and resubmit.</p></div><button className="btn btn-secondary" onClick={refreshRequests}>Refresh</button></div>
      <div className="media-submission-list">{ownRequests.length?ownRequests.map(request=>{const item=extractItem(request);return <article key={request.id} className={`media-submission-row ${request.status}`}>{item?.imageUrl&&<img src={item.imageUrl} alt=""/>}<div><strong>{item?.title||'Media submission'}</strong><span className={`approval-status ${request.status}`}>{request.status.replace('_',' ')}</span><small>Submitted {new Date(request.submitted_at).toLocaleString('en-GB')}</small>{request.review_note&&<p><b>Admin feedback:</b> {request.review_note}</p>}</div>{(request.status==='rejected'||request.status==='changes_requested')&&<button className="btn btn-secondary" disabled={previewMode} onClick={()=>amend(request)}>Amend & resubmit</button>}</article>}):<div className="member-empty-state"><h3>No submissions yet</h3><p>Your media approval history will appear here.</p></div>}</div>
    </section>
    <section className="admin-panel smm-live-media"><div className="eyebrow">Approved media</div><h3>Current public gallery</h3><p>Approved items are view-only for the Social Media Manager.</p><div className="smm-live-media-grid">{liveGallery.filter(item=>item.published).slice(0,12).map(item=><figure key={item.id}><img src={item.imageUrl} alt=""/><figcaption>{item.title}</figcaption></figure>)}</div></section>
  </div>
}


function activityLabel(event: ActivityEvent) {
  const names: Record<string,string> = {
    submitted_change:'Submitted changes', approved_and_published:'Approved and published changes', approved:'Approved changes', rejected:'Rejected changes', changes_requested:'Requested changes', published_section:'Published updates', recruitment_position_created:'Created a recruitment position', recruitment_position_updated:'Updated a recruitment position', recruitment_position_archived:'Archived a recruitment position', uploaded_profile_image:'Uploaded a profile image'
  }
  const target=event.target?.replaceAll(/([A-Z])/g,' $1').replace(/^./,char=>char.toUpperCase())||'organisation'
  return `${names[event.action]||event.action.replaceAll('_',' ')} · ${target}`
}

function ActivityFeed({events,refresh}:{events:ActivityEvent[];refresh:()=>void}){
 const [query,setQuery]=useState('')
 const filtered=events.filter(event=>activityLabel(event).toLowerCase().includes(query.toLowerCase()))
 return <div className="activity-page"><div className="admin-section-head"><div><div className="eyebrow">Organisation history</div><h2>Activity Feed</h2><p>A searchable record of important HQ actions.</p></div><button className="btn btn-secondary" onClick={refresh}>Refresh</button></div><section className="admin-panel activity-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search actions or sections…"/></section><div className="activity-timeline">{filtered.map(event=><article className="admin-panel activity-event" key={event.id}><span className="activity-event-dot"/><div><strong>{activityLabel(event)}</strong><small>{new Date(event.created_at).toLocaleString('en-GB')}</small>{event.details&&Object.keys(event.details).length>0&&<p>{Object.entries(event.details).slice(0,3).map(([key,value])=>`${key.replaceAll('_',' ')}: ${String(value)}`).join(' · ')}</p>}</div></article>)}{!filtered.length&&<div className="admin-panel member-empty-state"><h3>No activity found</h3><p>Try a different search.</p></div>}</div></div>
}


function ServicesManager({providers,setProviders,services,setServices,persist,onNotice}:{providers:ServiceProvider[];setProviders:Dispatch<SetStateAction<ServiceProvider[]>>;services:CreativeService[];setServices:Dispatch<SetStateAction<CreativeService[]>>;persist:(section:string,data:unknown)=>Promise<void>;onNotice:(message:string)=>void}){
  const [providerDraft,setProviderDraft]=useState<ServiceProvider|null>(null)
  const [serviceDraft,setServiceDraft]=useState<CreativeService|null>(null)
  const saveProviders=async(next:ServiceProvider[])=>{setProviders(next);await persist('serviceProviders',next);onNotice('Service providers saved.')}
  const saveServices=async(next:CreativeService[])=>{setServices(next);await persist('creativeServices',next);onNotice('Services saved.')}
  const newProvider=()=>setProviderDraft({id:crypto.randomUUID(),displayName:'',role:'',bio:'',profileImage:'',bannerImage:'',discordUrl:'',tiktokUrl:'',xUrl:'',youtubeUrl:'',acceptingWork:true,leadTime:'Contact for availability',sortOrder:providers.length+1})
  const newService=()=>setServiceDraft({id:crypto.randomUUID(),providerId:providers[0]?.id||'',title:'',category:'Other',summary:'',description:'',priceLabel:'Contact for quote',turnaround:'Agreed per project',inclusions:[],portfolioUrls:[],requestUrl:'',featured:false,active:true,sortOrder:services.length+1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})
  return <div className="services-manager"><ServiceRequestsPanel providers={providers} services={services} onNotice={onNotice}/><div className="admin-section-head"><div><div className="eyebrow">Creative commerce</div><h2>Services</h2><p>Manage sellers and every offering shown on the public Services page.</p></div><div className="admin-section-actions"><a className="btn recruitment-cancel" href="/services" target="_blank" rel="noreferrer">Preview ↗</a><button className="btn recruitment-cancel" onClick={newProvider}>+ Seller</button><button className="btn btn-primary" onClick={newService}>+ Service</button></div></div><div className="recruitment-admin-stats"><div><strong>{providers.length}</strong><span>Sellers</span></div><div><strong>{services.filter(item=>item.active).length}</strong><span>Active services</span></div><div><strong>{providers.filter(item=>item.acceptingWork).length}</strong><span>Accepting work</span></div></div><div className="services-admin-layout"><section><div className="eyebrow">Sellers</div>{providers.sort((a,b)=>a.sortOrder-b.sortOrder).map(provider=><article className="admin-panel service-admin-card" key={provider.id}><div><h3>{provider.displayName||'Unnamed seller'}</h3><p>{provider.role}</p><small>{provider.acceptingWork?'Accepting work':'Unavailable'}</small></div><button onClick={()=>setProviderDraft(structuredClone(provider))}>Edit</button></article>)}</section><section><div className="eyebrow">Offerings</div>{services.sort((a,b)=>a.sortOrder-b.sortOrder).map(service=><article className="admin-panel service-admin-card" key={service.id}><div><h3>{service.title||'Untitled service'}</h3><p>{providers.find(p=>p.id===service.providerId)?.displayName||'Unassigned'} · {service.priceLabel}</p><small>{service.active?'Public':'Hidden'}</small></div><div><a href={`/services/service?id=${encodeURIComponent(service.id)}`} target="_blank" rel="noreferrer">Preview ↗</a><button onClick={()=>setServiceDraft(structuredClone(service))}>Edit</button></div></article>)}</section></div>{providerDraft&&<div className="recruitment-modal-scrim"><section className="recruitment-editor" role="dialog" aria-modal="true"><header className="recruitment-editor-head"><div><div className="eyebrow">Services</div><h2>Edit seller</h2></div><button className="recruitment-close" onClick={()=>setProviderDraft(null)}>×</button></header><div className="recruitment-form"><label>Display name<input value={providerDraft.displayName} onChange={e=>setProviderDraft({...providerDraft,displayName:e.target.value})}/></label><label>Role<input value={providerDraft.role} onChange={e=>setProviderDraft({...providerDraft,role:e.target.value})}/></label><label className="wide">Bio<textarea rows={4} value={providerDraft.bio} onChange={e=>setProviderDraft({...providerDraft,bio:e.target.value})}/></label><label>Profile image URL<input value={providerDraft.profileImage} onChange={e=>setProviderDraft({...providerDraft,profileImage:e.target.value})}/></label><label>Banner image URL<input value={providerDraft.bannerImage} onChange={e=>setProviderDraft({...providerDraft,bannerImage:e.target.value})}/></label><label>Discord/contact URL<input value={providerDraft.discordUrl} onChange={e=>setProviderDraft({...providerDraft,discordUrl:e.target.value})}/></label><label>TikTok URL<input value={providerDraft.tiktokUrl} onChange={e=>setProviderDraft({...providerDraft,tiktokUrl:e.target.value})}/></label><label>Lead time<input value={providerDraft.leadTime} onChange={e=>setProviderDraft({...providerDraft,leadTime:e.target.value})}/></label><label className="featured-toggle"><span><strong>Accepting work</strong><small>Allow visitors to request this seller's services.</small></span><input type="checkbox" checked={providerDraft.acceptingWork} onChange={e=>setProviderDraft({...providerDraft,acceptingWork:e.target.checked})}/><i/></label></div><footer className="recruitment-editor-actions"><button className="btn recruitment-cancel" onClick={()=>setProviderDraft(null)}>Cancel</button><button className="btn btn-primary" onClick={async()=>{const next=providers.some(p=>p.id===providerDraft.id)?providers.map(p=>p.id===providerDraft.id?providerDraft:p):[...providers,providerDraft];await saveProviders(next);setProviderDraft(null)}}>Save seller</button></footer></section></div>}{serviceDraft&&<div className="recruitment-modal-scrim"><section className="recruitment-editor" role="dialog" aria-modal="true"><header className="recruitment-editor-head"><div><div className="eyebrow">Services</div><h2>Edit offering</h2></div><button className="recruitment-close" onClick={()=>setServiceDraft(null)}>×</button></header><div className="recruitment-form"><label>Service title<input value={serviceDraft.title} onChange={e=>setServiceDraft({...serviceDraft,title:e.target.value,updatedAt:new Date().toISOString()})}/></label><label>Seller<select value={serviceDraft.providerId} onChange={e=>setServiceDraft({...serviceDraft,providerId:e.target.value})}>{providers.map(provider=><option value={provider.id} key={provider.id}>{provider.displayName}</option>)}</select></label><label>Category<select value={serviceDraft.category} onChange={e=>setServiceDraft({...serviceDraft,category:e.target.value as CreativeService['category']})}>{['Blender','Thumbnail','Animation','Shortform Edit','Longform Edit','Motion Graphics','Other'].map(item=><option key={item}>{item}</option>)}</select></label><label>Price label<input value={serviceDraft.priceLabel} onChange={e=>setServiceDraft({...serviceDraft,priceLabel:e.target.value})}/></label><label className="wide">Summary<textarea value={serviceDraft.summary} onChange={e=>setServiceDraft({...serviceDraft,summary:e.target.value})}/></label><label className="wide">Description<textarea rows={5} value={serviceDraft.description} onChange={e=>setServiceDraft({...serviceDraft,description:e.target.value})}/></label><label className="wide">What's included <small>One per line</small><textarea rows={5} value={serviceDraft.inclusions.join('\n')} onChange={e=>setServiceDraft({...serviceDraft,inclusions:e.target.value.split('\n').filter(Boolean)})}/></label><label className="wide">Portfolio image URLs <small>One per line</small><textarea rows={4} value={serviceDraft.portfolioUrls.join('\n')} onChange={e=>setServiceDraft({...serviceDraft,portfolioUrls:e.target.value.split('\n').filter(Boolean)})}/></label><label>Turnaround<input value={serviceDraft.turnaround} onChange={e=>setServiceDraft({...serviceDraft,turnaround:e.target.value})}/></label><label>Request/contact URL<input value={serviceDraft.requestUrl} onChange={e=>setServiceDraft({...serviceDraft,requestUrl:e.target.value})}/></label><label className="featured-toggle"><span><strong>Public service</strong><small>Show this offering on the website.</small></span><input type="checkbox" checked={serviceDraft.active} onChange={e=>setServiceDraft({...serviceDraft,active:e.target.checked})}/><i/></label><label className="featured-toggle"><span><strong>Featured</strong><small>Give this offering priority placement.</small></span><input type="checkbox" checked={serviceDraft.featured} onChange={e=>setServiceDraft({...serviceDraft,featured:e.target.checked})}/><i/></label></div><footer className="recruitment-editor-actions"><button className="btn recruitment-cancel" onClick={()=>setServiceDraft(null)}>Cancel</button><button className="btn btn-primary" onClick={async()=>{const next=services.some(s=>s.id===serviceDraft.id)?services.map(s=>s.id===serviceDraft.id?serviceDraft:s):[...services,serviceDraft];await saveServices(next);setServiceDraft(null)}}>Save service</button></footer></section></div>}</div>
}

function emptyPosition(order:number):RecruitmentPosition{
 const now=new Date().toISOString()
 return{id:crypto.randomUUID(),title:'',department:'',category:'Other',summary:'',description:'',requirements:[''],preferredExperience:[],region:'',platform:'',game:'',openings:1,applicationRoute:'discord',applicationUrl:'',closingDate:'',coverImage:'',featured:false,status:'draft',sortOrder:order,createdAt:now,updatedAt:now}
}

function RecruitmentManager({positions,setPositions,websiteContent,persist,onNotice,isSocialManager=false,refreshApprovals=async()=>{}}:{positions:RecruitmentPosition[];setPositions:Dispatch<SetStateAction<RecruitmentPosition[]>>;websiteContent:WebsiteContent;persist:(section:string,data:unknown)=>Promise<void>;onNotice:(message:string)=>void;isSocialManager?:boolean;refreshApprovals?:()=>Promise<void>}){
 const [editing,setEditing]=useState<RecruitmentPosition|null>(null)
 const [original,setOriginal]=useState<RecruitmentPosition|null>(null)
 const [confirmDiscard,setConfirmDiscard]=useState(false)
 const update=(patch:Partial<RecruitmentPosition>)=>setEditing(current=>current?{...current,...patch,updatedAt:new Date().toISOString()}:current)
 const isDirty=Boolean(editing&&original&&JSON.stringify(editing)!==JSON.stringify(original))
 const openEditor=(position:RecruitmentPosition)=>{const clone=structuredClone(position);setEditing(clone);setOriginal(structuredClone(clone));setConfirmDiscard(false)}
 const closeEditor=()=>{setEditing(null);setOriginal(null);setConfirmDiscard(false)}
 const requestClose=()=>{if(isDirty){setConfirmDiscard(true);return}closeEditor()}
 useEffect(()=>{
  if(!editing)return
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();requestClose()}}
  window.addEventListener('keydown',onKey)
  document.body.classList.add('recruitment-editor-open')
  return()=>{window.removeEventListener('keydown',onKey);document.body.classList.remove('recruitment-editor-open')}
 },[editing,isDirty])
 useEffect(()=>{
  if(!editing||!isDirty)return
  const timer=window.setTimeout(()=>localStorage.setItem('v6-recruitment-draft',JSON.stringify(editing)),500)
  return()=>window.clearTimeout(timer)
 },[editing,isDirty])
 const save=async()=>{
  if(!editing?.title.trim()){onNotice('Add a role title first.');return}
  const existed=positions.some(p=>p.id===editing.id)
  const next=existed?positions.map(p=>p.id===editing.id?editing:p):[...positions,editing]
  setPositions(next);
  const oldItem=positions.find(p=>p.id===editing.id); const isProtected=Boolean(oldItem&&oldItem.status!=='draft'&&(Date.now()-new Date(oldItem.createdAt).getTime())>=86400000);
  if(isSocialManager&&!isProtected){const {error}=await supabase.rpc('social_save_recent_section',{section_name:'recruitmentPositions',proposed_data:next});if(error){onNotice(error.message);return}}else if(isSocialManager&&isProtected){await submitChange('recruitmentPositions',next);await refreshApprovals();onNotice('This position is protected. Changes submitted for approval.')}else await persist('recruitmentPositions',next)
  await recordActivity(existed?'recruitment_position_updated':'recruitment_position_created','recruitment',{title:editing.title,status:editing.status})
  localStorage.removeItem('v6-recruitment-draft')
  onNotice(existed?'Position updated.':'Position created.')
  closeEditor()
 }
 const archive=async(id:string)=>{
  const next=positions.map(p=>p.id===id?{...p,status:'archived' as const,updatedAt:new Date().toISOString()}:p)
  const oldItem=positions.find(p=>p.id===id);const isProtected=Boolean(oldItem&&oldItem.status!=='draft'&&(Date.now()-new Date(oldItem.createdAt).getTime())>=86400000);if(isSocialManager&&!isProtected){const {error}=await supabase.rpc('social_save_recent_section',{section_name:'recruitmentPositions',proposed_data:next});if(error){onNotice(error.message);return};setPositions(next)}else if(isSocialManager&&isProtected){await submitChange('recruitmentPositions',next);await refreshApprovals();onNotice('Closure/removal submitted for approval. The live position is unchanged.')}else{setPositions(next);await persist('recruitmentPositions',next)};await recordActivity('recruitment_position_archived','recruitment',{id})
 }
 return <div className="recruitment-manager"><div className="admin-section-head"><div><div className="eyebrow">Talent acquisition</div><h2>Recruitment Hub</h2><p>Create and manage multiple public vacancies.</p></div><button className="btn btn-primary" onClick={()=>openEditor(emptyPosition(positions.length+1))}>+ New position</button></div><div className="recruitment-admin-stats"><div><strong>{positions.filter(p=>p.status==='open').length}</strong><span>Open</span></div><div><strong>{positions.filter(p=>p.status==='draft').length}</strong><span>Drafts</span></div><div><strong>{positions.filter(p=>p.status==='closed').length}</strong><span>Closed</span></div></div><div className="recruitment-admin-list">{positions.filter(p=>p.status!=='archived').sort((a,b)=>a.sortOrder-b.sortOrder).map(position=><article className="admin-panel recruitment-admin-card" key={position.id}><div><div className="eyebrow">{position.category} · {position.status}</div><h3>{position.title||'Untitled position'}</h3><p>{position.summary||'No summary added yet.'}</p></div><div className="recruitment-admin-actions"><button onClick={()=>openEditor(position)}>Edit</button>{position.status==='open'&&<a href={`/recruitment/position?id=${encodeURIComponent(position.id)}`} target="_blank" rel="noreferrer">Preview ↗</a>}<button className="danger-button" onClick={()=>archive(position.id)}>Archive</button></div></article>)}{!positions.filter(p=>p.status!=='archived').length&&<div className="admin-panel member-empty-state"><h3>No positions yet</h3><p>Create your first vacancy when Version6ix is ready to recruit.</p></div>}</div>{editing&&<div className="recruitment-modal-scrim" role="presentation"><section className="recruitment-editor" role="dialog" aria-modal="true" aria-labelledby="recruitment-editor-title"><header className="recruitment-editor-head"><div><div className="eyebrow">Recruitment</div><h2 id="recruitment-editor-title">{positions.some(p=>p.id===editing.id)?'Edit position':'Create position'}</h2><p>{isDirty?'Unsaved changes':'Changes are saved only when you select Save position.'}</p></div><button className="recruitment-close" aria-label="Close recruitment editor" onClick={requestClose}>×</button></header><div className="recruitment-form"><label>Role title<input autoFocus value={editing.title} onChange={e=>update({title:e.target.value})}/></label><label>Department<input value={editing.department} onChange={e=>update({department:e.target.value})}/></label><label>Category<select value={editing.category} onChange={e=>update({category:e.target.value as RecruitmentPosition['category']})}>{['Player','Creator','Editor','Staff','Competitive','Other'].map(v=><option key={v}>{v}</option>)}</select></label><label>Status<select value={editing.status} onChange={e=>update({status:e.target.value as RecruitmentPosition['status']})}>{['draft','open','paused','closed'].map(v=><option key={v}>{v}</option>)}</select></label><label className="wide">Short summary<textarea value={editing.summary} onChange={e=>update({summary:e.target.value})}/></label><label className="wide">Full description<textarea rows={5} value={editing.description} onChange={e=>update({description:e.target.value})}/></label><label className="wide">Requirements <small>One per line</small><textarea rows={5} value={editing.requirements.join('\n')} onChange={e=>update({requirements:e.target.value.split('\n')})}/></label><label className="wide">Preferred experience <small>One per line</small><textarea rows={4} value={editing.preferredExperience.join('\n')} onChange={e=>update({preferredExperience:e.target.value.split('\n').filter(Boolean)})}/></label><label>Region<input value={editing.region} onChange={e=>update({region:e.target.value})}/></label><label>Platform<input value={editing.platform} onChange={e=>update({platform:e.target.value})}/></label><label>Game<input value={editing.game} onChange={e=>update({game:e.target.value})}/></label><label>Openings<input type="number" min="1" value={editing.openings} onChange={e=>update({openings:Number(e.target.value)})}/></label><label>Application route<select value={editing.applicationRoute} onChange={e=>update({applicationRoute:e.target.value as RecruitmentPosition['applicationRoute']})}><option value="discord">Discord ticket</option><option value="website">Website/external form</option><option value="both">Both</option></select></label><label>Application URL<input value={editing.applicationUrl} placeholder={websiteContent.discordUrl||'https://…'} onChange={e=>update({applicationUrl:e.target.value})}/></label><label>Closing date<input type="date" value={editing.closingDate} onChange={e=>update({closingDate:e.target.value})}/></label><label>Cover image URL<input value={editing.coverImage} onChange={e=>update({coverImage:e.target.value})}/></label><label className="featured-toggle"><span><strong>Featured position</strong><small>Give this vacancy priority styling on the public page.</small></span><input type="checkbox" checked={editing.featured} onChange={e=>update({featured:e.target.checked})}/><i aria-hidden="true"/></label></div><footer className="recruitment-editor-actions"><button className="btn recruitment-cancel" onClick={requestClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save position</button></footer></section>{confirmDiscard&&<div className="discard-dialog-scrim"><section className="discard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="discard-title"><div className="eyebrow">Unsaved changes</div><h3 id="discard-title">Discard this position?</h3><p>Your entered information will be lost.</p><div><button className="btn recruitment-cancel" onClick={()=>setConfirmDiscard(false)}>Keep editing</button><button className="btn danger-button" onClick={()=>{localStorage.removeItem('v6-recruitment-draft');closeEditor()}}>Discard</button></div></section></div>}</div>}</div>
}
function daysSince(dateValue: string) {
  if (!dateValue) return null
  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

function isAbsenceActive(memberId: string, data: CreatorHubData) {
  const today = new Date().toISOString().slice(0, 10)
  return data.absences.some((absence) => absence.memberId === memberId && absence.approved && absence.startDate <= today && absence.endDate >= today)
}

function creatorStatus(memberId: string, data: CreatorHubData, members: Member[]) {
  if (!members.some((member) => member.id === memberId)) return 'not-tracked'
  if (isAbsenceActive(memberId, data)) return 'absent'
  const activity = data.activities.find((item) => item.memberId === memberId)
  const days = daysSince(activity?.lastPostDate || '')
  if (days === null) return 'not-tracked'
  if (days >= data.reviewFrom) return 'review-required'
  if (days >= data.overdueFrom) return 'overdue'
  if (days >= data.dueSoonFrom) return 'due-soon'
  return 'active'
}

const statusLabel: Record<string, string> = {
  active: 'Active',
  'due-soon': 'Due soon',
  overdue: 'Overdue',
  'review-required': 'Review required',
  absent: 'Approved absence',
  'not-tracked': 'No date recorded',
}

type TeamManagerProps = {
  teams: Team[]
  setTeams: Dispatch<SetStateAction<Team[]>>
  members: Member[]
  canEdit: boolean
  toggleTeam: (memberId: string, teamId: string, checked: boolean) => void
  updateMembership: (memberId: string, teamId: string, patch: { role?: TeamRole; sortOrder?: number }) => void
  save: () => Promise<void> | void
  saveMembers: () => Promise<void> | void
}

function TeamManager({ teams, setTeams, members, canEdit, toggleTeam, updateMembership, save, saveMembers }: TeamManagerProps) {
  const [query, setQuery] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [notice, setNotice] = useState('')
  const [draggedMember, setDraggedMember] = useState<{ teamId: string; memberId: string } | null>(null)
  const [dragOverMember, setDragOverMember] = useState<{ teamId: string; memberId: string } | null>(null)
  const [memberSearch, setMemberSearch] = useState<Record<string, string>>({})
  const [teamsDirty, setTeamsDirty] = useState(false)
  const [rosterDirty, setRosterDirty] = useState(false)
  const [saving, setSaving] = useState<'teams' | 'roster' | null>(null)

  const orderedTeams = [...teams].sort((a, b) => a.sortOrder - b.sortOrder)

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!teamsDirty && !rosterDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [teamsDirty, rosterDirty])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function saveTeamChanges() {
    setSaving('teams')
    try {
      await save()
      setTeamsDirty(false)
      setNotice('Team settings saved successfully.')
    } finally {
      setSaving(null)
    }
  }

  async function saveRosterChanges() {
    setSaving('roster')
    try {
      await saveMembers()
      setRosterDirty(false)
      setNotice('Roster changes saved successfully.')
    } finally {
      setSaving(null)
    }
  }

  function createTeam() {
    const name = newTeamName.trim()
    if (!name) return
    const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `team-${Date.now()}`
    const id = teams.some((team) => team.id === baseId) ? `${baseId}-${Date.now()}` : baseId
    setTeams((current) => [...current, { id, name, publicName: name, sortOrder: current.length + 1, active: true }])
    setTeamsDirty(true)
    setNewTeamName('')
    setShowCreate(false)
    setNotice(`${name} created. Save teams when you are ready.`)
  }

  function moveTeam(teamId: string, direction: -1 | 1) {
    const list = [...orderedTeams]
    const index = list.findIndex((team) => team.id === teamId)
    const next = index + direction
    if (index < 0 || next < 0 || next >= list.length) return
    ;[list[index], list[next]] = [list[next], list[index]]
    setTeams((current) => current.map((team) => ({ ...team, sortOrder: list.findIndex((item) => item.id === team.id) + 1 })))
    setTeamsDirty(true)
  }

  function reorderMember(teamId: string, draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    const ordered = members
      .filter((member) => member.active && member.memberships.some((membership) => membership.teamId === teamId))
      .sort((a, b) => (a.memberships.find((m) => m.teamId === teamId)?.sortOrder || 99) - (b.memberships.find((m) => m.teamId === teamId)?.sortOrder || 99))
    const fromIndex = ordered.findIndex((member) => member.id === draggedId)
    const toIndex = ordered.findIndex((member) => member.id === targetId)
    if (fromIndex < 0 || toIndex < 0) return
    const next = [...ordered]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    next.forEach((member, index) => updateMembership(member.id, teamId, { sortOrder: index + 1 }))
    setRosterDirty(true)
    setNotice('Roster order updated. Save roster changes when you are ready.')
  }

  return <div className="team-manager">
    <div className="admin-section-head team-manager-head">
      <div><h2>Teams</h2><p>Manage public teams, leadership roles and roster order from one place.</p></div>
      <div className="admin-actions">
        <button className="btn btn-secondary" disabled={!canEdit} onClick={() => setShowCreate(true)}>Add team</button>
        <button className="btn btn-secondary" disabled={!canEdit || !rosterDirty || saving !== null} onClick={saveRosterChanges}>{saving === 'roster' ? 'Saving roster…' : 'Save roster changes'}</button>
        <button className="btn btn-primary" disabled={!canEdit || !teamsDirty || saving !== null} onClick={saveTeamChanges}>{saving === 'teams' ? 'Saving teams…' : 'Save teams'}</button>
      </div>
    </div>
    {notice && <div className="admin-notice">{notice}</div>}
    <div className="team-manager-toolbar">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members across teams…" />
      <span>{teams.filter((team) => team.active).length} public teams · {members.filter((member) => member.active).length} active members</span>
    </div>
    <div className="team-card-grid">
      {orderedTeams.map((team, teamIndex) => {
        const teamMembers = members
          .filter((member) => member.active && member.memberships.some((membership) => membership.teamId === team.id))
          .filter((member) => member.name.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => (a.memberships.find((m) => m.teamId === team.id)?.sortOrder || 99) - (b.memberships.find((m) => m.teamId === team.id)?.sortOrder || 99))
        const available = members.filter((member) => member.active && !member.memberships.some((membership) => membership.teamId === team.id))
        return <section className="team-management-card" key={team.id}>
          <div className="team-card-head">
            <div>
              <div className="team-card-meta">
                <span className={team.active ? 'team-live-badge' : 'team-hidden-badge'}>{team.active ? 'Public' : 'Hidden'}</span>
                <span className="team-card-count"><strong>{teamMembers.length}</strong> member{teamMembers.length === 1 ? '' : 's'}</span>
              </div>
              <input aria-label="Internal team name" disabled={!canEdit} value={team.name} onChange={(event) => { setTeamsDirty(true); setTeams((current) => current.map((item) => item.id === team.id ? { ...item, name: event.target.value } : item)) }} />
              <input aria-label="Public team name" disabled={!canEdit} value={team.publicName} onChange={(event) => { setTeamsDirty(true); setTeams((current) => current.map((item) => item.id === team.id ? { ...item, publicName: event.target.value } : item)) }} />
            </div>
            <div className="team-card-actions">
              <button disabled={!canEdit || teamIndex === 0} onClick={() => moveTeam(team.id, -1)} aria-label={`Move ${team.publicName} up`}>↑</button>
              <button disabled={!canEdit || teamIndex === orderedTeams.length - 1} onClick={() => moveTeam(team.id, 1)} aria-label={`Move ${team.publicName} down`}>↓</button>
              <button className={team.active ? 'team-visibility active' : 'team-visibility'} disabled={!canEdit} onClick={() => { if (team.active && !window.confirm(`Hide ${team.publicName} from the public roster?`)) return; setTeamsDirty(true); setTeams((current) => current.map((item) => item.id === team.id ? { ...item, active: !item.active } : item)) }}>{team.active ? 'Hide' : 'Publish'}</button>
            </div>
          </div>
          {canEdit && <div className="team-add-member">
            <span>Add member</span>
            <div className="team-member-search">
              <input
                value={memberSearch[team.id] || ''}
                onChange={(event) => setMemberSearch((current) => ({ ...current, [team.id]: event.target.value }))}
                placeholder="Search and add a member…"
                aria-label={`Search members to add to ${team.publicName}`}
              />
              {(memberSearch[team.id] || '').trim() && <div className="team-member-search-results">
                {available.filter((member) => member.name.toLowerCase().includes((memberSearch[team.id] || '').trim().toLowerCase())).slice(0, 8).map((member) => <button key={member.id} type="button" onClick={() => { toggleTeam(member.id, team.id, true); setRosterDirty(true); setNotice(`${member.name} added to ${team.publicName}. Save roster changes when ready.`); setMemberSearch((current) => ({ ...current, [team.id]: '' })) }}>
                  <img src={member.profileImage || DEFAULT_PROFILE_IMAGE} alt="" />
                  <span><strong>{member.name}</strong><small>{member.position || 'Member'}</small></span>
                  <b>Add</b>
                </button>)}
                {!available.some((member) => member.name.toLowerCase().includes((memberSearch[team.id] || '').trim().toLowerCase())) && <div className="team-search-empty">No available members found.</div>}
              </div>}
            </div>
          </div>}
          <div className="team-roster-list">
            {teamMembers.length ? teamMembers.map((member, memberIndex) => {
              const membership = member.memberships.find((item) => item.teamId === team.id)!
              const isDragging = draggedMember?.teamId === team.id && draggedMember.memberId === member.id
              const isDragOver = dragOverMember?.teamId === team.id && dragOverMember.memberId === member.id
              return <div
                className={`team-roster-row${isDragging ? ' is-dragging' : ''}${isDragOver ? ' is-drag-over' : ''}`}
                key={member.id}
                draggable={canEdit}
                onDragStart={(event) => {
                  setDraggedMember({ teamId: team.id, memberId: member.id })
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', member.id)
                }}
                onDragOver={(event) => {
                  if (!canEdit || draggedMember?.teamId !== team.id) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDragOverMember({ teamId: team.id, memberId: member.id })
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggedMember?.teamId === team.id) reorderMember(team.id, draggedMember.memberId, member.id)
                  setDraggedMember(null)
                  setDragOverMember(null)
                }}
                onDragEnd={() => { setDraggedMember(null); setDragOverMember(null) }}
              >
                <span className="team-drag-handle" aria-hidden="true" title="Drag to reorder"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                <img src={member.profileImage || DEFAULT_PROFILE_IMAGE} alt="" />
                <div className="team-member-identity"><strong>{member.name}</strong><small>{member.position || 'Member'}</small></div>
                <select aria-label={`${member.name} team role`} disabled={!canEdit} value={membership.role} onChange={(event) => { updateMembership(member.id, team.id, { role: event.target.value as TeamRole }); setRosterDirty(true) }}>{teamRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                <div className="team-order-actions">
                  <button className="team-remove-member" disabled={!canEdit} onClick={() => { if (!window.confirm(`Remove ${member.name} from ${team.publicName}?`)) return; toggleTeam(member.id, team.id, false); setRosterDirty(true); setNotice(`${member.name} removed from ${team.publicName}. Save roster changes when ready.`) }} aria-label={`Remove ${member.name} from ${team.publicName}`}>Remove</button>
                </div>
              </div>
            }) : <div className="hq-empty-state"><strong>No members assigned</strong><span>Add an active member using the selector above.</span></div>}
          </div>
        </section>
      })}
    </div>
    {showCreate && <div className="member-create-overlay" role="dialog" aria-modal="true" aria-label="Create team" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowCreate(false) }}>
      <div className="member-create-modal team-create-modal">
        <div className="member-create-head"><div><span className="eyebrow">Team management</span><h2>Create a team</h2><p>Add the team first, then assign members from its card.</p></div><button onClick={() => setShowCreate(false)} aria-label="Close">×</button></div>
        <label className="team-create-field">Team name<input autoFocus value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createTeam() }} placeholder="e.g. Academy Team" /></label>
        <div className="member-create-footer"><span></span><div><button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn btn-primary" disabled={!newTeamName.trim()} onClick={createTeam}>Create team</button></div></div>
      </div>
    </div>}
  </div>
}

type CreatorHubProps = {
  data: CreatorHubData
  setData: (value: CreatorHubData) => void
  members: Member[]
  teams: Team[]
  persist: (section: string, data: unknown) => Promise<void>
  onNotice: (message: string) => void
}

function CreatorHub({ data, setData, members, teams, persist, onNotice }: CreatorHubProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState('')
  const [editorMemberId, setEditorMemberId] = useState<string | null>(null)
  const [absenceMemberId, setAbsenceMemberId] = useState<string | null>(null)
  const [reviewMemberId, setReviewMemberId] = useState<string | null>(null)
  const [absenceDraft, setAbsenceDraft] = useState({ startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), reason: '' })
  const [reviewReason, setReviewReason] = useState('Content inactivity review')

  const trackedMembers = useMemo(() => members.filter((member) => member.active && member.memberships.some((membership) => data.trackedTeamIds.includes(membership.teamId))), [members, data.trackedTeamIds])
  const allRows = useMemo(() => trackedMembers.map((member) => {
    const activity = data.activities.find((item) => item.memberId === member.id) || { memberId: member.id, lastPostDate: '', postsThisPeriod: 0, lastCheckedAt: '', notes: '' }
    const status = creatorStatus(member.id, data, members)
    return { member, activity, status, days: daysSince(activity.lastPostDate) }
  }), [trackedMembers, data, members])
  const rows = useMemo(() => allRows.filter((row) => {
    const search = query.trim().toLowerCase()
    const textMatch = !search || row.member.name.toLowerCase().includes(search) || row.member.tiktok.toLowerCase().includes(search)
    return textMatch && (statusFilter === 'all' || row.status === statusFilter)
  }), [allRows, query, statusFilter])

  function commit(next: CreatorHubData) {
    setData(next)
    setDirty(true)
  }

  function updateActivity(memberId: string, patch: Partial<CreatorActivity>) {
    const existing = data.activities.find((item) => item.memberId === memberId)
    const next: CreatorActivity = { memberId, lastPostDate: '', postsThisPeriod: 0, notes: '', ...existing, ...patch, lastCheckedAt: new Date().toISOString() }
    commit({ ...data, activities: existing ? data.activities.map((item) => item.memberId === memberId ? next : item) : [...data.activities, next] })
  }

  function addAbsence() {
    if (!absenceMemberId || !absenceDraft.startDate || !absenceDraft.endDate) return
    const absence: CreatorAbsence = { id: crypto.randomUUID(), memberId: absenceMemberId, startDate: absenceDraft.startDate, endDate: absenceDraft.endDate, reason: absenceDraft.reason.trim(), approved: true }
    commit({ ...data, absences: [...data.absences, absence] })
    setAbsenceMemberId(null)
    setAbsenceDraft({ startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), reason: '' })
    onNotice('Approved absence added. Save creator data to publish it.')
  }

  function openReview() {
    if (!reviewMemberId) return
    if (data.reviews.some((review) => review.memberId === reviewMemberId && review.status === 'open')) {
      setReviewMemberId(null)
      onNotice('This creator already has an open review.')
      return
    }
    const review: CreatorReview = { id: crypto.randomUUID(), memberId: reviewMemberId, status: 'open', reason: reviewReason.trim() || 'Content inactivity review', createdAt: new Date().toISOString() }
    commit({ ...data, reviews: [...data.reviews, review] })
    setReviewMemberId(null)
    setReviewReason('Content inactivity review')
    onNotice('Creator review added to the queue.')
  }

  async function save() {
    setSaving(true)
    try {
      await persist('creatorHub', data)
      setDirty(false)
      const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      setLastSaved(time)
      onNotice('Creator tracking data saved.')
    } finally {
      setSaving(false)
    }
  }

  const statuses = ['active','due-soon','overdue','review-required','absent']
  const counts = statuses.reduce<Record<string,number>>((acc, status) => {
    acc[status] = allRows.filter((row) => row.status === status).length
    return acc
  }, {})
  const attentionRows = allRows.filter((row) => row.status === 'review-required' || row.status === 'overdue').sort((a, b) => (b.days || 0) - (a.days || 0))
  const openReviews = data.reviews.filter((review) => review.status === 'open')
  const today = new Date().toISOString().slice(0, 10)
  const relevantAbsences = data.absences.filter((absence) => absence.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const editorRow = allRows.find((row) => row.member.id === editorMemberId)
  const absenceMember = members.find((member) => member.id === absenceMemberId)
  const reviewMember = members.find((member) => member.id === reviewMemberId)

  return <div className="creator-hub creator-hub-v2">
    <div className="admin-section-head creator-hub-heading"><div><h2>Creator Tracking</h2><p>Monitor posting activity, manage approved absences and keep every creator review in one focused queue.</p></div><div className="creator-save-area"><span>{dirty ? 'Unsaved changes' : lastSaved ? `Last saved ${lastSaved}` : 'All changes saved'}</span><button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving creator data…' : 'Save creator data'}</button></div></div>

    <div className="creator-stats creator-status-tabs">
      {statuses.map((status) => <button className={statusFilter === status ? 'is-active' : ''} key={status} onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}><strong>{counts[status] || 0}</strong><span>{statusLabel[status]}</span></button>)}
    </div>

    <section className="admin-panel creator-attention-panel">
      <div className="admin-section-head"><div><div className="eyebrow">Priority queue</div><h3>Needs attention</h3><p>Creators who are overdue or have reached the formal review threshold.</p></div><span className="creator-queue-count">{attentionRows.length}</span></div>
      {attentionRows.length ? <div className="creator-attention-list">{attentionRows.map(({ member, status, days }) => <button key={member.id} onClick={() => setEditorMemberId(member.id)}><span><strong>{member.name}</strong><small>@{member.tiktok || 'No TikTok linked'}</small></span><span><b>{days ?? '—'} days</b><small>{statusLabel[status]}</small></span><span>Review →</span></button>)}</div> : <div className="hq-empty-state"><strong>Creator activity is up to date</strong><span>No overdue creators or formal reviews require attention.</span></div>}
    </section>

    <section className="admin-panel creator-settings">
      <div><div className="eyebrow">Requirements</div><h3>Posting thresholds</h3><p>Statuses update automatically from each creator's latest confirmed upload date.</p></div>
      <label>Due soon from<input type="number" min="1" value={data.dueSoonFrom} onChange={(event)=>commit({...data,dueSoonFrom:Number(event.target.value)})}/><small>days</small></label>
      <label>Overdue from<input type="number" min="1" value={data.overdueFrom} onChange={(event)=>commit({...data,overdueFrom:Number(event.target.value)})}/><small>days</small></label>
      <label>Review from<input type="number" min="1" value={data.reviewFrom} onChange={(event)=>commit({...data,reviewFrom:Number(event.target.value)})}/><small>days</small></label>
      <label>Tracked teams<select multiple value={data.trackedTeamIds} onChange={(event)=>commit({...data,trackedTeamIds:Array.from(event.currentTarget.selectedOptions, (option: HTMLOptionElement) => option.value)})}>{teams.map((team)=><option value={team.id} key={team.id}>{team.publicName}</option>)}</select></label>
    </section>

    <div className="member-toolbar creator-toolbar"><input placeholder="Search creators…" value={query} onChange={(event)=>setQuery(event.target.value)}/><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
    <div className="creator-table-wrap"><table className="creator-table"><thead><tr><th>Creator</th><th>Last post</th><th>Days</th><th>Posts</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {rows.map(({member,activity,status,days}) => <tr key={member.id}><td><strong>{member.name}</strong><small>@{member.tiktok || 'Not linked'}</small></td><td><input type="date" value={activity.lastPostDate} onChange={(event)=>updateActivity(member.id,{lastPostDate:event.target.value})}/></td><td>{days === null ? '—' : days}</td><td><input className="small-number" type="number" min="0" value={activity.postsThisPeriod} onChange={(event)=>updateActivity(member.id,{postsThisPeriod:Number(event.target.value)})}/></td><td><span className={`creator-status status-${status}`}>{statusLabel[status]}</span></td><td><div className="table-actions"><button onClick={()=>setEditorMemberId(member.id)}>Details</button><button onClick={()=>setAbsenceMemberId(member.id)}>Absence</button><button onClick={()=>setReviewMemberId(member.id)}>Review</button><a href={member.usesTeamTikTok ? 'https://www.tiktok.com/@v6era' : `https://www.tiktok.com/@${member.tiktok}`} target="_blank" rel="noreferrer">TikTok ↗</a></div></td></tr>)}
      {rows.length===0 && <tr><td colSpan={6}><div className="hq-empty-state"><strong>No creators found</strong><span>Adjust your search or status filter.</span></div></td></tr>}
    </tbody></table></div>

    <div className="creator-lower-grid">
      <section className="admin-panel review-queue"><div className="admin-section-head"><div><h3>Open review queue</h3><p>{openReviews.length} review{openReviews.length === 1 ? '' : 's'} waiting for action.</p></div></div>{openReviews.map((review)=>{const member=members.find((item)=>item.id===review.memberId);return <div className="review-row" key={review.id}><div><strong>{member?.name || 'Unknown member'}</strong><span>{review.reason}</span><small>Opened {new Date(review.createdAt).toLocaleString('en-GB')}</small></div><button onClick={()=>commit({...data,reviews:data.reviews.map((item)=>item.id===review.id?{...item,status:'resolved',resolvedAt:new Date().toISOString()}:item)})}>Resolve</button></div>})}{!openReviews.length&&<div className="hq-empty-state compact"><strong>No open reviews</strong><span>New creator reviews will appear here.</span></div>}</section>
      <section className="admin-panel absence-list"><div className="admin-section-head"><div><h3>Approved absences</h3><p>Current and upcoming periods where posting requirements are paused.</p></div></div>{relevantAbsences.map((absence)=>{const member=members.find((item)=>item.id===absence.memberId);return <div className="review-row" key={absence.id}><div><strong>{member?.name || 'Unknown member'}</strong><span>{absence.startDate} → {absence.endDate}</span><small>{absence.reason || 'No note provided'}</small></div><button className="danger-button" onClick={()=>commit({...data,absences:data.absences.filter((item)=>item.id!==absence.id)})}>Remove</button></div>})}{!relevantAbsences.length&&<div className="hq-empty-state compact"><strong>No active absences</strong><span>Approved creator absences will appear here.</span></div>}</section>
    </div>
    <p className="tracking-note">TikTok does not provide a dependable public API for reading every member’s latest post without account authorisation. HQ stores the latest confirmed date and calculates each status automatically.</p>

    {editorRow && <div className="member-create-overlay" role="dialog" aria-modal="true" aria-label={`Creator details for ${editorRow.member.name}`} onMouseDown={(event)=>{if(event.currentTarget===event.target)setEditorMemberId(null)}}><div className="member-create-modal creator-detail-modal"><div className="member-create-head"><div><span className="eyebrow">Creator details</span><h2>{editorRow.member.name}</h2><p>Update the latest confirmed upload and keep internal review notes.</p></div><button onClick={()=>setEditorMemberId(null)} aria-label="Close">×</button></div><div className="creator-detail-grid"><label>Last confirmed post<input type="date" value={editorRow.activity.lastPostDate} onChange={(event)=>updateActivity(editorRow.member.id,{lastPostDate:event.target.value})}/></label><label>Posts this period<input type="number" min="0" value={editorRow.activity.postsThisPeriod} onChange={(event)=>updateActivity(editorRow.member.id,{postsThisPeriod:Number(event.target.value)})}/></label><label className="full">Internal notes<textarea rows={5} value={editorRow.activity.notes} onChange={(event)=>updateActivity(editorRow.member.id,{notes:event.target.value})} placeholder="Add context for the next reviewer…"/></label></div><div className="creator-detail-summary"><span className={`creator-status status-${editorRow.status}`}>{statusLabel[editorRow.status]}</span><small>{editorRow.days === null ? 'No post date recorded' : `${editorRow.days} days since the last confirmed post`}</small></div><div className="member-create-footer"><span></span><div><button className="btn btn-secondary" onClick={()=>setEditorMemberId(null)}>Done</button></div></div></div></div>}

    {absenceMemberId && <div className="member-create-overlay" role="dialog" aria-modal="true" aria-label="Add approved absence" onMouseDown={(event)=>{if(event.currentTarget===event.target)setAbsenceMemberId(null)}}><div className="member-create-modal creator-action-modal"><div className="member-create-head"><div><span className="eyebrow">Approved absence</span><h2>{absenceMember?.name}</h2><p>Pause posting requirements for a defined period.</p></div><button onClick={()=>setAbsenceMemberId(null)} aria-label="Close">×</button></div><div className="creator-detail-grid"><label>Start date<input type="date" value={absenceDraft.startDate} onChange={(event)=>setAbsenceDraft({...absenceDraft,startDate:event.target.value})}/></label><label>End date<input type="date" value={absenceDraft.endDate} onChange={(event)=>setAbsenceDraft({...absenceDraft,endDate:event.target.value})}/></label><label className="full">Reason or note<textarea rows={4} value={absenceDraft.reason} onChange={(event)=>setAbsenceDraft({...absenceDraft,reason:event.target.value})} placeholder="Holiday, exams, equipment issue…"/></label></div><div className="member-create-footer"><span></span><div><button className="btn btn-secondary" onClick={()=>setAbsenceMemberId(null)}>Cancel</button><button className="btn btn-primary" disabled={!absenceDraft.startDate||!absenceDraft.endDate} onClick={addAbsence}>Approve absence</button></div></div></div></div>}

    {reviewMemberId && <div className="member-create-overlay" role="dialog" aria-modal="true" aria-label="Open creator review" onMouseDown={(event)=>{if(event.currentTarget===event.target)setReviewMemberId(null)}}><div className="member-create-modal creator-action-modal"><div className="member-create-head"><div><span className="eyebrow">Creator review</span><h2>{reviewMember?.name}</h2><p>Add this creator to the formal review queue.</p></div><button onClick={()=>setReviewMemberId(null)} aria-label="Close">×</button></div><label className="creator-review-reason">Reason<textarea autoFocus rows={5} value={reviewReason} onChange={(event)=>setReviewReason(event.target.value)}/></label><div className="member-create-footer"><span></span><div><button className="btn btn-secondary" onClick={()=>setReviewMemberId(null)}>Cancel</button><button className="btn btn-primary" onClick={openReview}>Open review</button></div></div></div></div>}
  </div>
}
function CreatorReports({ data, members, teams, assets, gallery, requests }: { data: CreatorHubData; members: Member[]; teams: Team[]; assets: BrandAsset[]; gallery: GalleryItem[]; requests: ChangeRequest[] }) {
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('30')
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState('')
  const tracked = members.filter((member)=>member.active && member.memberships.some((membership)=>data.trackedTeamIds.includes(membership.teamId)))
  const rows = tracked.map((member)=>{const activity=data.activities.find((item)=>item.memberId===member.id);const status=creatorStatus(member.id,data,members);return {member,activity,status,days:daysSince(activity?.lastPostDate||'')}})
  const activeMembers = members.filter((member)=>member.active)
  const archivedMembers = members.filter((member)=>!member.active)
  const publicTeams = teams.filter((team)=>team.active)
  const hiddenTeams = teams.filter((team)=>!team.active)
  const unassigned = activeMembers.filter((member)=>member.memberships.length===0)
  const publishedAssets = assets.filter((asset)=>Boolean(asset.storagePath)).length
  const publishedMedia = gallery.filter((item)=>item.published).length
  const cutoff = range === 'all' ? null : Date.now() - Number(range) * 86400000
  const filteredRequests = requests.filter((request)=>!cutoff || new Date(request.submitted_at).getTime() >= cutoff)
  const approvalCounts = {
    pending: filteredRequests.filter((item)=>item.status==='pending').length,
    approved: filteredRequests.filter((item)=>item.status==='approved').length,
    rejected: filteredRequests.filter((item)=>item.status==='rejected').length,
    changes: filteredRequests.filter((item)=>item.status==='changes_requested').length,
  }
  const adminActivity = Array.from(filteredRequests.reduce((map, request)=>{
    const name=request.admin_profiles?.display_name || request.admin_profiles?.email || 'Administrator'
    map.set(name,(map.get(name)||0)+1)
    return map
  },new Map<string,number>()).entries()).sort((a,b)=>b[1]-a[1])
  const teamRows = [...teams].sort((a,b)=>a.sortOrder-b.sortOrder).map((team)=>({team,count:activeMembers.filter((member)=>member.memberships.some((membership)=>membership.teamId===team.id)).length}))

  const downloadCsv = (filename:string, headers:string[], body:Array<Array<string|number>>) => {
    const csv=[headers,...body].map((line)=>line.map((cell)=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n')
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();URL.revokeObjectURL(url)
  }
  const today = new Date().toISOString().slice(0,10)
  const runExport = (key:string, label:string, action:()=>void) => {
    if (exporting) return
    setExporting(key)
    setExportNotice('')
    window.setTimeout(() => {
      action()
      setExporting(null)
      setExportNotice(`${label} exported`)
      window.setTimeout(() => setExportNotice(''), 2800)
    }, 180)
  }
  const exportCreators=()=>downloadCsv(`v6-creator-report-${today}.csv`,['Member','TikTok','Last post','Days since','Posts this period','Status'],rows.map((row)=>[row.member.name,row.member.tiktok,row.activity?.lastPostDate||'',row.days??'',row.activity?.postsThisPeriod??0,statusLabel[row.status]]))
  const exportMembers=()=>downloadCsv(`v6-member-roster-${today}.csv`,['Member','Position','Country','TikTok','Input','DPI','Sensitivity','Status'],members.map((member)=>[member.name,member.position,member.countryCode,member.tiktok,member.inputType,member.dpi,member.sensitivity,member.active?'Active':'Archived']))
  const exportTeams=()=>downloadCsv(`v6-team-rosters-${today}.csv`,['Team','Member','Team role','Order','Public'],teams.flatMap((team)=>members.flatMap((member)=>member.memberships.filter((membership)=>membership.teamId===team.id).map((membership)=>[team.publicName,member.name,membership.role,membership.sortOrder,team.active?'Yes':'No']))))
  const exportApprovals=()=>downloadCsv(`v6-approval-history-${today}.csv`,['Submitted','Administrator','Section','Status','Reviewed'],filteredRequests.map((request)=>[new Date(request.submitted_at).toLocaleString('en-GB'),request.admin_profiles?.display_name||request.admin_profiles?.email||'Administrator',request.section,request.status,request.reviewed_at?new Date(request.reviewed_at).toLocaleString('en-GB'):'']))

  return <div className="reports-suite">
    {exportNotice && <div className="team-toast report-export-toast" role="status">✓ {exportNotice}</div>}
    <div className="admin-section-head reports-heading"><div><div className="eyebrow">Organisation intelligence</div><h2>Reports & Analytics</h2><p>Live operational reporting using verified HQ data.</p></div><label className="reports-range">Activity period<select value={range} onChange={(event)=>setRange(event.target.value as '7'|'30'|'90'|'all')}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select></label></div>

    <div className="report-kpi-grid">
      <article><strong>{activeMembers.length}</strong><span>Active members</span><small>{archivedMembers.length} archived</small></article>
      <article><strong>{publicTeams.length}</strong><span>Public teams</span><small>{hiddenTeams.length} hidden</small></article>
      <article><strong>{tracked.length}</strong><span>Tracked creators</span><small>{rows.filter((row)=>row.status==='review-required'||row.status==='overdue').length} need attention</small></article>
      <article><strong>{publishedMedia + publishedAssets}</strong><span>Published assets</span><small>{publishedMedia} media · {publishedAssets} brand</small></article>
    </div>

    <div className="reports-grid">
      <section className="admin-panel report-card"><div className="report-card-head"><div><div className="eyebrow">Organisation</div><h3>Team health</h3></div><button className="btn report-export-button" disabled={Boolean(exporting)} onClick={()=>runExport('teams','Team report',exportTeams)}><span aria-hidden="true">↓</span>{exporting==='teams'?'Exporting…':'Export teams'}</button></div><div className="analytics-list">{teamRows.map(({team,count})=><div key={team.id}><span><strong>{team.publicName}</strong><small>{team.active?'Public':'Hidden'}</small></span><b>{count}</b></div>)}</div>{unassigned.length>0&&<div className="report-alert"><strong>{unassigned.length} unassigned member{unassigned.length===1?'':'s'}</strong><span>{unassigned.slice(0,5).map((member)=>member.name).join(', ')}{unassigned.length>5?'…':''}</span></div>}</section>

      <section className="admin-panel report-card"><div className="report-card-head"><div><div className="eyebrow">Creators</div><h3>Content compliance</h3></div><button className="btn report-export-button" disabled={Boolean(exporting)} onClick={()=>runExport('creators','Creator report',exportCreators)}><span aria-hidden="true">↓</span>{exporting==='creators'?'Exporting…':'Export creators'}</button></div><div className="creator-report-bars">{['active','due-soon','overdue','review-required','absent','not-tracked'].map((status)=>{const count=rows.filter((row)=>row.status===status).length;const pct=tracked.length?Math.round(count/tracked.length*100):0;return <div key={status}><span><b>{statusLabel[status]}</b><small>{count}</small></span><div><i style={{width:`${pct}%`}}/></div></div>})}</div></section>

      <section className="admin-panel report-card"><div className="report-card-head"><div><div className="eyebrow">Workflow</div><h3>Approval activity</h3></div><button className="btn report-export-button" disabled={Boolean(exporting)} onClick={()=>runExport('approvals','Approval report',exportApprovals)}><span aria-hidden="true">↓</span>{exporting==='approvals'?'Exporting…':'Export approvals'}</button></div><div className="approval-report-grid"><div><strong>{approvalCounts.pending}</strong><span>Pending</span></div><div><strong>{approvalCounts.approved}</strong><span>Approved</span></div><div><strong>{approvalCounts.rejected}</strong><span>Rejected</span></div><div><strong>{approvalCounts.changes}</strong><span>Changes requested</span></div></div><div className="analytics-list compact">{adminActivity.slice(0,6).map(([name,count])=><div key={name}><span><strong>{name}</strong><small>Submitted changes</small></span><b>{count}</b></div>)}{adminActivity.length===0&&<div className="hq-empty-state compact"><strong>No approval activity</strong><small>No changes were submitted in this period.</small></div>}</div></section>

      <section className="admin-panel report-card"><div className="report-card-head"><div><div className="eyebrow">Roster</div><h3>Member overview</h3></div><button className="btn report-export-button" disabled={Boolean(exporting)} onClick={()=>runExport('members','Member report',exportMembers)}><span aria-hidden="true">↓</span>{exporting==='members'?'Exporting…':'Export members'}</button></div><div className="roster-insights"><div><strong>{activeMembers.length}</strong><span>Active</span></div><div><strong>{archivedMembers.length}</strong><span>Archived</span></div><div><strong>{unassigned.length}</strong><span>Unassigned</span></div><div><strong>{members.filter((member)=>member.position==='Founder'||member.position==='Owner').length}</strong><span>Ownership</span></div></div><div className="report-list compact-list">{activeMembers.slice().sort((a,b)=>a.name.localeCompare(b.name)).slice(0,8).map((member)=><div key={member.id}><span><strong>{member.name}</strong><small>{member.position||'Member'}</small></span><span>{member.memberships.length?member.memberships.map((membership)=>teams.find((team)=>team.id===membership.teamId)?.publicName).filter(Boolean).join(', '):'Unassigned'}</span></div>)}</div></section>
    </div>
  </div>
}

type MembersCMSProps = {
  members: Member[]
  teams: Team[]
  canEdit: boolean
  dirty: boolean
  addMember: (member: Member) => void
  createRequest: number
  updateMember: (memberId: string, patch: Partial<Member>) => void
  toggleTeam: (memberId: string, teamId: string, checked: boolean) => void
  updateMembership: (
    memberId: string,
    teamId: string,
    patch: { role?: TeamRole; sortOrder?: number },
  ) => void
  uploadProfileImage: (memberId: string, file: File) => Promise<void>
  save: () => Promise<void>
  discordEveryoneAllowed: boolean
  discordAutoSyncEnabled:boolean
  isSuperUser:boolean
  removeMemberFromV6:(memberId:string)=>Promise<void>
}

function MembersCMS({
  members,
  teams,
  canEdit,
  dirty,
  addMember,
  createRequest,
  updateMember,
  toggleTeam,
  updateMembership,
  uploadProfileImage,
  save,
  discordEveryoneAllowed,
  discordAutoSyncEnabled,
  isSuperUser,
  removeMemberFromV6,
}: MembersCMSProps) {
  const [query, setQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('active')
  const [createOpen, setCreateOpen] = useState(false)
  const [createAnother, setCreateAnother] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Member>(() => newMember())
  const [discordPosting, setDiscordPosting] = useState<string | null>(null)
  const [discordPostResult, setDiscordPostResult] = useState<Record<string,string>>({})
  const [includeDiscordPfp, setIncludeDiscordPfp] = useState<Record<string,boolean>>({})
  const [discordAudit, setDiscordAudit] = useState<DiscordAuditSummary|null>(null)
  const [discordAuditing, setDiscordAuditing] = useState(false)
  const [discordBulkSyncing, setDiscordBulkSyncing] = useState(false)

  async function runDiscordAudit(){
    setDiscordAuditing(true)
    try{setDiscordAudit(await auditDiscordMembers())}
    catch(error){setDiscordPostResult(current=>({...current,__audit:error instanceof Error?error.message:'Discord audit failed.'}))}
    finally{setDiscordAuditing(false)}
  }
  async function bulkSafeSync(){
    if(dirty){setDiscordPostResult(current=>({...current,__audit:'Save member changes before running a bulk Discord sync.'}));return}
    if(!window.confirm('Sync every safe Discord mismatch to match HQ? Blocked/unverified accounts will be skipped.'))return
    setDiscordBulkSyncing(true)
    try{
      const result=await syncAllSafeDiscordMembers()
      setDiscordPostResult(current=>({...current,__audit:`Discord sync complete: ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed.`}))
      setDiscordAudit(await auditDiscordMembers())
    }catch(error){setDiscordPostResult(current=>({...current,__audit:error instanceof Error?error.message:'Bulk Discord sync failed.'}))}
    finally{setDiscordBulkSyncing(false)}
  }

  useEffect(() => {
    if (createRequest > 0) setCreateOpen(true)
  }, [createRequest])

  useEffect(() => {
    if (!createOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setCreateOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [createOpen])

  function openCreateMember() {
    setDraft(newMember())
    setCreateError('')
    setCreateSuccess('')
    setCreateOpen(true)
  }

  function createMemberRecord() {
    const name = draft.name.trim()
    if (!name) { setCreateError('Enter a display name before creating the member.'); return }
    if (members.some((member) => member.name.trim().toLowerCase() === name.toLowerCase() && member.active)) {
      setCreateError('An active member with this name already exists.')
      return
    }
    setCreating(true)
    setCreateError('')
    addMember({ ...draft, name })
    setQuery(name)
    setTeamFilter('all')
    setStatusFilter('active')
    setCreateSuccess(`${name} created successfully.`)
    if (createAnother) {
      setDraft(newMember())
      window.setTimeout(() => setCreateSuccess(''), 2200)
    } else {
      window.setTimeout(() => { setCreateOpen(false); setCreateSuccess('') }, 500)
    }
    window.setTimeout(() => setCreating(false), 350)
  }

  async function postMemberWelcome(member: Member) {
    if (!member.discordUserId?.trim()) { setDiscordPostResult(current=>({...current,[member.id]:'Add the member Discord User ID first.'})); return }
    if (!member.memberships.length) { setDiscordPostResult(current=>({...current,[member.id]:'Assign at least one team before posting.'})); return }
    if (!discordEveryoneAllowed) { setDiscordPostResult(current=>({...current,[member.id]:'@everyone is disabled in Newsroom → Discord News Distribution.'})); return }
    setDiscordPosting(member.id)
    setDiscordPostResult(current=>({...current,[member.id]:''}))
    try {
      await publishMemberWelcomeToDiscord(member.id, includeDiscordPfp[member.id] !== false)
      setDiscordPostResult(current=>({...current,[member.id]:'Welcome posted to Discord.'}))
      await recordActivity('discord_member_welcome_posted','members',{member_id:member.id,name:member.name})
    } catch (error) {
      setDiscordPostResult(current=>({...current,[member.id]:error instanceof Error?error.message:'Discord post failed.'}))
    } finally { setDiscordPosting(null) }
  }

  async function manualDiscordSync(member:Member){
    if(!member.discordUserId?.trim()){setDiscordPostResult(current=>({...current,[member.id]:'Add and save the Discord User ID before syncing.'}));return}
    if(dirty){setDiscordPostResult(current=>({...current,[member.id]:'Save member changes first.'}));return}
    setDiscordPosting(member.id)
    try{await syncMemberDiscord(member.id,member.leftV6?'remove':'sync',true);setDiscordPostResult(current=>({...current,[member.id]:'Discord roles and nickname synced.'}))}
    catch(error){setDiscordPostResult(current=>({...current,[member.id]:error instanceof Error?error.message:'Discord sync failed.'}))}
    finally{setDiscordPosting(null)}
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return members
      .filter((member) => {
        const matchesText =
          !normalized ||
          member.name.toLowerCase().includes(normalized) ||
          member.tiktok.toLowerCase().includes(normalized) ||
          member.position.toLowerCase().includes(normalized)
        const matchesTeam =
          teamFilter === 'all' || member.memberships.some((item) => item.teamId === teamFilter)
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'active' ? member.active : !member.active)
        return matchesText && matchesTeam && matchesStatus
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [members, query, teamFilter, statusFilter])

  const archivedCount = members.filter((member) => !member.active).length

  return (
    <div>
      <div className="admin-section-head members-cms-head">
        <div>
          <h2>Members</h2>
          <p>{members.filter((member) => member.active).length} active · {archivedCount} archived</p>
        </div>
        {canEdit && (
          <div className="admin-actions">
            <button className="btn btn-secondary" onClick={openCreateMember}>
              Add member
            </button>
            <button className="btn btn-primary" disabled={!dirty} onClick={save}>
              {dirty ? 'Save member changes' : 'Members saved'}
            </button>
          </div>
        )}
      </div>

      {isSuperUser&&<section className="admin-panel discord-audit-panel">
        <div className="admin-section-head">
          <div><div className="eyebrow">HQ source of truth</div><h3>Discord Audit & Sync</h3><p>Compare every linked Discord account with the roles, teams and nickname stored in HQ. The Com role is ignored for V6 members because your auto-role bot may reapply it.</p></div>
          <div className="admin-actions"><button className="btn btn-secondary" disabled={discordAuditing||dirty} onClick={runDiscordAudit}>{discordAuditing?'Checking Discord…':'Audit Discord'}</button>{discordAudit&&<button className="btn btn-primary" disabled={discordBulkSyncing||dirty||discordAudit.mismatched===0} onClick={bulkSafeSync}>{discordBulkSyncing?'Syncing…':'Sync all safe changes'}</button>}</div>
        </div>
        {dirty&&<small>Save member changes before auditing or bulk syncing so Discord is compared with the published HQ record.</small>}
        {discordAudit&&<><div className="discord-audit-stats"><div><strong>{discordAudit.linked}</strong><span>Linked</span></div><div><strong>{discordAudit.correct}</strong><span>Correct</span></div><div><strong>{discordAudit.mismatched}</strong><span>Out of sync</span></div><div><strong>{discordAudit.blocked}</strong><span>Blocked</span></div><div><strong>{discordAudit.missingIds}</strong><span>Missing IDs</span></div><div><strong>{discordAudit.notInServer}</strong><span>Not in server</span></div></div>
        <div className="discord-audit-results">{discordAudit.members.filter(item=>item.status!=='ok').map(item=><article key={item.memberId} data-status={item.status}><div><strong>{item.name}</strong><small>{item.discordUserId||'No Discord User ID'}</small></div><div>{item.issues.map((issue,index)=><span key={`${issue.type}-${index}`}>{issue.label}</span>)}</div>{item.status==='blocked'&&<b>Manual action required</b>}</article>)}</div></>}
        {discordPostResult.__audit&&<small className="member-discord-result">{discordPostResult.__audit}</small>}
      </section>}

      <section className="admin-panel member-toolbar" aria-label="Member filters">
        <label>
          Search members
          <input
            type="search"
            value={query}
            placeholder="Name, TikTok or position…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Team
          <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            <option value="all">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.publicName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as MemberStatusFilter)}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </label>
        <div className="member-result-count">
          <strong>{filtered.length}</strong>
          <span>shown</span>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="admin-panel member-empty-state">
          <h3>No members found</h3>
          <p>Try another search, team or status filter.</p>
        </div>
      ) : (
        <div className="member-profile-list">
          {filtered.map((member) => (
            <details className={`member-profile-card ${member.active ? '' : 'is-archived'}`} key={member.id}>
              <summary>
                <img src={member.profileImage || DEFAULT_PROFILE_IMAGE} alt="" />
                <div>
                  <strong>{member.name}</strong>
                  <span>
                    {member.position ||
                      member.memberships
                        .map((membership) =>
                          teams.find((team) => team.id === membership.teamId)?.publicName,
                        )
                        .filter(Boolean)
                        .join(' • ') ||
                      'No public role set'}
                  </span>
                </div>
                <span className={`member-status-badge ${member.active ? 'active' : 'archived'}`}>
                  {member.leftV6 ? 'Left V6' : member.active ? 'Active' : 'Archived'}
                </span>
              </summary>

              <div className="member-profile-form">
                <label>
                  Display name
                  <input
                    disabled={!canEdit}
                    value={member.name}
                    onChange={(event) => updateMember(member.id, { name: event.target.value })}
                  />
                </label>
                <label>
                  Organisation position
                  <select
                    disabled={!canEdit}
                    value={member.position}
                    onChange={(event) =>
                      updateMember(member.id, {
                        position: event.target.value as OrganisationPosition,
                      })
                    }
                  >
                    {positionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option || 'None'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Country
                  <CountryPicker disabled={!canEdit} value={member.countryCode} onChange={(countryCode)=>updateMember(member.id,{countryCode})}/>
                </label>
                <label>
                  Input
                  <select
                    disabled={!canEdit}
                    value={member.inputType}
                    onChange={(event) =>
                      updateMember(member.id, { inputType: event.target.value as Member['inputType'] })
                    }
                  >
                    <option value="">Not set</option>
                    <option>Keyboard & Mouse</option>
                    <option>Controller</option>
                  </select>
                </label>
                {member.inputType === 'Keyboard & Mouse' && (
                  <label>
                    DPI
                    <input
                      disabled={!canEdit}
                      value={member.dpi}
                      inputMode="numeric"
                      onChange={(event) => updateMember(member.id, { dpi: event.target.value })}
                    />
                  </label>
                )}
                <label>
                  Sensitivity
                  <input
                    disabled={!canEdit}
                    value={member.sensitivity}
                    inputMode="decimal"
                    onChange={(event) =>
                      updateMember(member.id, { sensitivity: event.target.value })
                    }
                  />
                </label>
                <label>
                  TikTok username
                  <input
                    disabled={!canEdit}
                    value={member.tiktok}
                    placeholder="@username"
                    onChange={(event) => updateMember(member.id, { tiktok: event.target.value })}
                  />
                </label>
                <label>
                  Discord User ID
                  <input
                    disabled={!canEdit}
                    value={member.discordUserId || ''}
                    inputMode="numeric"
                    placeholder="e.g. 123456789012345678"
                    onChange={(event) => updateMember(member.id, { discordUserId: event.target.value.replace(/\D/g, '') })}
                  />
                </label>
                <div className="member-discord-role-flags">
                  <label className="inline-check"><input type="checkbox" disabled={!canEdit} checked={Boolean(member.discordTrial)} onChange={(event)=>updateMember(member.id,{discordTrial:event.target.checked})}/><span><strong>6ix Trial</strong><small>Trial Sniper players receive 6ix Trial instead of Sniper Team until this is switched off.</small></span></label>
                  <label className="inline-check"><input type="checkbox" disabled={!canEdit} checked={Boolean(member.discordSniperRecruitment)} onChange={(event)=>updateMember(member.id,{discordSniperRecruitment:event.target.checked})}/><span><strong>Sniper Recruitment</strong><small>Manual Discord recruitment role.</small></span></label>
                </div>
                <label className="inline-check member-toggle">
                  <input
                    disabled={!canEdit}
                    type="checkbox"
                    checked={member.usesTeamTikTok || false}
                    onChange={(event) =>
                      updateMember(member.id, { usesTeamTikTok: event.target.checked })
                    }
                  />
                  Use main v6 TikTok
                </label>
                <div className="member-pfp-control">
                  <span>Profile picture</span>
                  <img src={member.profileImage || DEFAULT_PROFILE_IMAGE} alt="" />
                  {canEdit && (
                    <div className="admin-actions">
                      <label className="small-upload">
                        Upload PFP
                        <input
                          hidden
                          type="file"
                          accept="image/*"
                          onChange={(event) =>
                            event.target.files?.[0] &&
                            uploadProfileImage(member.id, event.target.files[0])
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => updateMember(member.id, { profileImage: DEFAULT_PROFILE_IMAGE })}
                      >
                        Use v6 default
                      </button>
                    </div>
                  )}
                </div>

                <div className="wide">
                  <h3>Team assignments</h3>
                  <div className="team-membership-grid">
                    {teams.map((team) => {
                      const membership = member.memberships.find((item) => item.teamId === team.id)
                      return (
                        <div className="team-membership-row" key={team.id}>
                          <input
                            disabled={!canEdit}
                            aria-label={`Add ${member.name} to ${team.publicName}`}
                            type="checkbox"
                            checked={Boolean(membership)}
                            onChange={(event) =>
                              toggleTeam(member.id, team.id, event.target.checked)
                            }
                          />
                          <span>{team.publicName}</span>
                          <select
                            disabled={!canEdit || !membership}
                            value={membership?.role || 'member'}
                            onChange={(event) =>
                              updateMembership(member.id, team.id, {
                                role: event.target.value as TeamRole,
                              })
                            }
                          >
                            {teamRoleOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            disabled={!canEdit || !membership}
                            aria-label="Display order"
                            type="number"
                            min="1"
                            value={membership?.sortOrder || 99}
                            onChange={(event) =>
                              updateMembership(member.id, team.id, {
                                sortOrder: Number(event.target.value),
                              })
                            }
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {canEdit && !member.leftV6 && (
                  <div className="wide member-discord-onboarding">
                    <div className="member-discord-onboarding-copy">
                      <h3>Discord automation</h3>
                      <p>{discordAutoSyncEnabled?'Saving member/team changes automatically mirrors configured V6 roles and the ᵛ⁶ nickname in Discord.':'Automatic Discord role sync is currently disabled by the Super User.'}</p>
                      {!member.discordUserId?.trim()&&<strong className="discord-required-note">Add their Discord User ID and save the member before Discord actions unlock.</strong>}
                    </div>
                    <div className="member-discord-actions">
                      <button type="button" className="btn btn-secondary member-discord-sync-button" disabled={discordPosting===member.id || dirty || !member.discordUserId?.trim()} onClick={()=>manualDiscordSync(member)}>{discordPosting===member.id?'Syncing…':'Sync Discord now'}</button>
                      {member.active&&<>
                        <label className="inline-check"><input type="checkbox" checked={includeDiscordPfp[member.id] !== false} onChange={(event)=>setIncludeDiscordPfp(current=>({...current,[member.id]:event.target.checked}))}/>Include website profile picture</label>
                        <button type="button" className="btn btn-primary member-discord-welcome-button" disabled={discordPosting===member.id || dirty || !member.discordUserId?.trim() || !member.memberships.length || !discordEveryoneAllowed} onClick={()=>postMemberWelcome(member)}>{discordPosting===member.id?'Posting…':'Post welcome to Discord'}</button>
                      </>}
                    </div>
                    {dirty && <small>Save member changes first. Discord only uses the published HQ record.</small>}
                    {member.active&&!member.memberships.length && <small>Assign at least one team before a welcome announcement can be posted.</small>}
                    {!discordEveryoneAllowed && member.active && <small>@everyone is disabled in Discord News Distribution settings.</small>}
                    {discordPostResult[member.id] && <small className="member-discord-result">{discordPostResult[member.id]}</small>}
                  </div>
                )}

                {canEdit && (
                  <div className="wide member-record-actions">
                    <button type="button" className={member.active ? 'danger-button' : 'btn btn-secondary'} onClick={() => updateMember(member.id, member.leftV6 ? { active:true,leftV6:false } : { active: !member.active })}>
                      {member.leftV6 ? 'Rejoin V6' : member.active ? 'Archive member' : 'Restore member'}
                    </button>
                    <span>{member.leftV6?'Former member record retained in HQ. Rejoin restores V6 membership but no team roles until assigned.':'Archive is for inactivity: hides them from the public roster but does not reset their V6 Discord identity. Remove team assignments separately if required.'}</span>
                    {isSuperUser&&!member.leftV6&&<button type="button" className="danger-button remove-v6-button" onClick={async()=>{if(!window.confirm(`Remove ${member.name} from V6 entirely? This will clear all team assignments and reset their Discord roles to Com + Verified.`))return;await removeMemberFromV6(member.id)}}>Remove from V6</button>}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="member-create-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false) }}>
          <section className="member-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-member-title">
            <div className="member-create-head">
              <div><div className="eyebrow">Members</div><h2 id="create-member-title">Create new member</h2><p>No member is added until you press Create member.</p></div>
              <button type="button" aria-label="Close create member" onClick={() => setCreateOpen(false)}>×</button>
            </div>
            <div className="member-create-sections">
              <fieldset className="member-create-section">
                <legend>Basic information</legend>
                <div className="member-create-grid">
                  <label className="wide">Display name <span aria-hidden="true">*</span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Player name" required /></label>
                  <label>Initial team<select value={draft.memberships[0]?.teamId || ''} onChange={(event) => setDraft({ ...draft, memberships: event.target.value ? [{ teamId: event.target.value, role: draft.memberships[0]?.role || 'member', sortOrder: 99 }] : [] })}><option value="">No team yet</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.publicName}</option>)}</select></label>{draft.memberships[0]&&<label>Initial team role<select value={draft.memberships[0].role} onChange={(event)=>setDraft({...draft,memberships:[{...draft.memberships[0],role:event.target.value as TeamRole}]})}>{teamRoleOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
                  <label>Organisation position<select value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value as OrganisationPosition })}>{positionOptions.map((option) => <option key={option} value={option}>{option || 'None'}</option>)}</select></label>
                  <label>Country<CountryPicker value={draft.countryCode} onChange={(countryCode)=>setDraft({...draft,countryCode})}/></label>
                </div>
              </fieldset>

              <fieldset className="member-create-section">
                <legend>Gaming settings</legend>
                <div className="member-create-grid">
                  <label>Input<select value={draft.inputType} onChange={(event) => setDraft({ ...draft, inputType: event.target.value as Member['inputType'], dpi: event.target.value === 'Keyboard & Mouse' ? draft.dpi : '' })}><option value="">Not set</option><option>Keyboard & Mouse</option><option>Controller</option></select></label>
                  {draft.inputType === 'Keyboard & Mouse' && <label>DPI<input inputMode="numeric" value={draft.dpi} onChange={(event) => setDraft({ ...draft, dpi: event.target.value })}/></label>}
                  <label>Sensitivity<input inputMode="decimal" value={draft.sensitivity} onChange={(event) => setDraft({ ...draft, sensitivity: event.target.value })}/></label>
                </div>
              </fieldset>

              <fieldset className="member-create-section">
                <legend>Social account</legend>
                <div className="member-create-grid">
                  <label className="wide">Discord User ID<input inputMode="numeric" value={draft.discordUserId || ''} onChange={(event)=>setDraft({...draft,discordUserId:event.target.value.replace(/\D/g,'')})} placeholder="Right-click Discord user → Copy User ID" /></label>
                  <label className="inline-check"><input type="checkbox" checked={Boolean(draft.discordTrial)} onChange={(event)=>setDraft({...draft,discordTrial:event.target.checked})}/>6ix Trial</label>
                  <label className="inline-check"><input type="checkbox" checked={Boolean(draft.discordSniperRecruitment)} onChange={(event)=>setDraft({...draft,discordSniperRecruitment:event.target.checked})}/>Sniper Recruitment</label>
                  <label className="wide">TikTok username<input disabled={Boolean(draft.usesTeamTikTok)} value={draft.tiktok} onChange={(event) => setDraft({ ...draft, tiktok: event.target.value.replace(/^@/, '') })} placeholder={draft.usesTeamTikTok ? 'Using @v6Era' : 'username'} /></label>
                  <div className="v6-switch-row wide">
                    <div><strong>Use official V6 TikTok</strong><span>This member will link to the official @v6Era account instead of a personal TikTok.</span></div>
                    <label className="v6-switch">
                      <input type="checkbox" checked={Boolean(draft.usesTeamTikTok)} onChange={(event) => setDraft({ ...draft, usesTeamTikTok: event.target.checked })}/>
                      <span className="v6-switch-track" aria-hidden="true"><span /></span>
                      <span className="sr-only">Use official V6 TikTok</span>
                    </label>
                  </div>
                </div>
              </fieldset>
            </div>
            {createError && <p className="member-create-error" role="alert">{createError}</p>}
            {createSuccess && <p className="member-create-success" role="status">✓ {createSuccess}</p>}
            <div className="member-create-footer">
              <label className="inline-check"><input type="checkbox" checked={createAnother} onChange={(event) => setCreateAnother(event.target.checked)}/>Create another after saving</label>
              <div><button type="button" className="btn btn-secondary" disabled={creating} onClick={() => setCreateOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={!draft.name.trim() || creating} onClick={createMemberRecord}>{creating ? 'Creating…' : 'Create member'}</button></div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

type ApprovalDiff = { field: string; before: unknown; after: unknown }

const approvalFieldLabels: Record<string, string> = {
  name: 'Name', position: 'Position', tiktok: 'TikTok', usesTeamTikTok: 'Use V6 TikTok', active: 'Status',
  inputType: 'Input', dpi: 'DPI', sensitivity: 'Sensitivity', countryCode: 'Country', profileImage: 'Profile picture',
  memberships: 'Team memberships', teamId: 'Team', teamRole: 'Team role', sortOrder: 'Display order',
  title: 'Title', caption: 'Caption', published: 'Published', fileName: 'File', version: 'Version',
  channelId: 'YouTube channel', maxVideos: 'Maximum videos', heroTitle: 'Hero title', heroAccent: 'Hero accent',
  heroDescription: 'Hero description', heroImage: 'Hero image', announcementEnabled: 'Announcement enabled',
  announcementText: 'Announcement text', announcementLink: 'Announcement link', primaryButtonText: 'Primary button text',
  primaryButtonLink: 'Primary button link', secondaryButtonText: 'Secondary button text', secondaryButtonLink: 'Secondary button link',
  footerText: 'Footer text', seoTitle: 'SEO title', seoDescription: 'SEO description', seoKeywords: 'SEO keywords',
  startDate: 'Start date', endDate: 'End date', reason: 'Reason', lastPostDate: 'Latest post date', postsThisPeriod: 'Posts this period',
}

function prettifyApprovalField(path: string) {
  const parts = path.split('.').filter(Boolean)
  const last = parts[parts.length - 1] || path
  return approvalFieldLabels[last] || last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c)=>c.toUpperCase())
}

function displayApprovalValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not set'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.map((item)=>typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ') : 'None'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function objectName(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  return String(record.name || record.title || record.display_name || record.fileName || '')
}

function buildApprovalDiff(before: unknown, after: unknown, path = ''): ApprovalDiff[] {
  if (Object.is(before, after)) return []
  if (Array.isArray(before) && Array.isArray(after)) {
    const objectArrays = [...before, ...after].every((item)=>item && typeof item === 'object' && 'id' in (item as Record<string, unknown>))
    if (objectArrays) {
      const beforeMap = new Map(before.map((item)=>[String((item as Record<string, unknown>).id), item]))
      const afterMap = new Map(after.map((item)=>[String((item as Record<string, unknown>).id), item]))
      const ids = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()]))
      return ids.flatMap((id)=>{
        const oldItem = beforeMap.get(id)
        const newItem = afterMap.get(id)
        const label = objectName(newItem || oldItem) || 'Item'
        if (!oldItem) return [{ field: `${label} added`, before: undefined, after: label }]
        if (!newItem) return [{ field: `${label} removed`, before: label, after: undefined }]
        return buildApprovalDiff(oldItem, newItem, label)
      })
    }
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ field: prettifyApprovalField(path), before, after }]
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const oldRecord = before as Record<string, unknown>
    const newRecord = after as Record<string, unknown>
    const keys = Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]))
    return keys.flatMap((key)=>{
      if (['id', 'created_at', 'updated_at', 'submitted_at', 'reviewed_at', 'published_at'].includes(key)) return []
      const nextPath = path ? `${path}.${key}` : key
      return buildApprovalDiff(oldRecord[key], newRecord[key], nextPath)
    })
  }
  return [{ field: path.includes('.') ? `${path.split('.')[0]} — ${prettifyApprovalField(path)}` : prettifyApprovalField(path), before, after }]
}

function ApprovalCentre({
  role,
  requests,
  currentSections,
  refresh,
  review,
}: {
  role: AdminRole
  requests: ChangeRequest[]
  currentSections: Record<string, unknown>
  refresh: () => Promise<void>
  review: (request: ChangeRequest, decision: 'approved' | 'rejected' | 'changes_requested', note: string) => Promise<void>
}) {
  const [status, setStatus] = useState('pending')
  const shown = requests.filter((request) => status === 'all' || request.status === status)
  return <div>
    <div className="admin-section-head">
      <div><h2>Approval Centre</h2><p>Only fields that actually changed are shown.</p></div>
      <div className="admin-actions">
        <select value={status} onChange={(event)=>setStatus(event.target.value)}>
          <option value="pending">Pending</option><option value="approved">Approved</option>
          <option value="changes_requested">Changes requested</option><option value="rejected">Rejected</option><option value="all">All</option>
        </select>
        <button className="btn btn-secondary" onClick={refresh}>Refresh</button>
      </div>
    </div>
    {shown.length === 0 ? <div className="admin-panel member-empty-state"><h3>No requests</h3><p>There are no changes in this view.</p></div> :
      <div className="approval-list">{shown.map((request)=><ApprovalCard key={request.id} request={request} currentData={currentSections[request.section]} owner={role==='owner'||role==='super_user'} review={review}/>)}</div>}
  </div>
}

function ApprovalCard({request, currentData, owner, review}:{request:ChangeRequest;currentData:unknown;owner:boolean;review:(request:ChangeRequest,decision:'approved'|'rejected'|'changes_requested',note:string)=>Promise<void>}){
  const [note,setNote]=useState(request.review_note||'')
  const differences = buildApprovalDiff(currentData, request.proposed_data)
  const submitter = request.admin_profiles?.display_name || request.admin_profiles?.email || 'Admin'
  return <details className="admin-panel approval-card" open={request.status==='pending'}>
    <summary><div><strong>{submitter} updated {prettifyApprovalField(request.section)}</strong><span>{new Date(request.submitted_at).toLocaleString('en-GB')}</span></div><span className={`approval-status ${request.status}`}>{request.status.replace('_',' ')}</span></summary>
    <div className="approval-body">
      {differences.length === 0 ? <p className="approval-no-diff">No differences detected.</p> : <div className="approval-diff-table" role="table" aria-label="Changed fields">
        <div className="approval-diff-head" role="row"><span>Field</span><span>Before</span><span>After</span></div>
        {differences.map((difference,index)=><div className="approval-diff-row" role="row" key={`${difference.field}-${index}`}>
          <strong>{difference.field}</strong>
          <span className="approval-before">{displayApprovalValue(difference.before)}</span>
          <span className="approval-after">{displayApprovalValue(difference.after)}</span>
        </div>)}
      </div>}
      {owner && request.status==='pending' && <>
        <label>Review note<textarea value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Optional note for the submitting admin"/></label>
        <div className="admin-actions">
          <button className="btn btn-primary" onClick={()=>review(request,'approved',note)}>Approve & publish</button>
          <button className="btn btn-secondary" onClick={()=>review(request,'changes_requested',note)}>Request changes</button>
          <button className="danger-button" onClick={()=>review(request,'rejected',note)}>Reject</button>
        </div>
      </>}
    </div>
  </details>
}

function AdminManager({ role, email: currentEmail, onNotice }: { role: AdminRole; email: string; onNotice: (message:string)=>void }) {
  type Row={user_id:string;email:string;display_name:string|null;role:AdminRole;active:boolean}
  type Invite={email:string;display_name:string|null;role:AdminRole;active:boolean;created_at:string}
  const [rows,setRows]=useState<Row[]>([]),[invites,setInvites]=useState<Invite[]>([])
  const [email,setEmail]=useState(''),[name,setName]=useState(''),[inviteRole,setInviteRole]=useState<AdminRole>('website_admin')
  const [secondaryTarget,setSecondaryTarget]=useState(''),[confirmation,setConfirmation]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false)
  const isPrimary=role==='owner'
  const isSuper=role==='owner'||role==='super_user'
  async function refresh(){
    if(!isSuper) return
    const [{data:profiles},{data:invitationRows}]=await Promise.all([
      supabase.from('admin_profiles').select('*').order('created_at'),
      supabase.from('admin_invitations').select('*').order('created_at'),
    ])
    setRows((profiles||[]) as Row[]);setInvites((invitationRows||[]) as Invite[])
  }
  useEffect(()=>{refresh()},[role])
  if(!isSuper) return <div className="admin-panel"><p>Only a Super User can manage administrator access.</p></div>
  const secondary=rows.find((row)=>row.role==='super_user')
  async function update(userId:string,patch:Partial<Row>){
    const row=rows.find((item)=>item.user_id===userId)
    if(row?.role==='owner'||row?.role==='super_user'){onNotice('Protected Super User accounts must be managed from the Super User panel.');return}
    const {error}=await supabase.from('admin_profiles').update(patch).eq('user_id',userId)
    if(error){onNotice(error.message);return} await refresh();onNotice('Administrator access updated.')
  }
  async function addInvite(){
    const normalized=email.trim().toLowerCase();if(!normalized)return
    const {data:{user}}=await supabase.auth.getUser()
    const {error}=await supabase.from('admin_invitations').upsert({email:normalized,display_name:name.trim()||normalized.split('@')[0],role:inviteRole,active:true,invited_by:user?.id},{onConflict:'email'})
    if(error){onNotice(error.message);return}
    await supabase.from('admin_profiles').update({display_name:name.trim()||undefined,role:inviteRole,active:true}).eq('email',normalized)
    setEmail('');setName('');await refresh();onNotice('HQ email authorised. Copy the private setup link from the authorised-email list.')
  }
  async function revokeInvite(inviteEmail:string){
    await supabase.from('admin_invitations').update({active:false}).eq('email',inviteEmail)
    await supabase.from('admin_profiles').update({active:false}).eq('email',inviteEmail)
    await refresh();onNotice('Administrator access revoked.')
  }
  async function copySetupLink(inviteEmail:string){
    const link=`${window.location.origin}/login/?setup=1&email=${encodeURIComponent(inviteEmail)}`
    try{await navigator.clipboard.writeText(link);onNotice('Private account setup link copied.')}catch{onNotice(link)}
  }
  async function changeSecondary(grant:boolean){
    if(!isPrimary){onNotice('Only the Primary Super User can change secondary Super User access.');return}
    if(confirmation.trim()!==(grant?'GRANT SUPER USER':'REVOKE SUPER USER')){onNotice(`Type ${grant?'GRANT SUPER USER':'REVOKE SUPER USER'} exactly.`);return}
    if(!password){onNotice('Enter your current password to continue.');return}
    setBusy(true)
    const authResult=await supabase.auth.signInWithPassword({email:currentEmail,password})
    if(authResult.error){setBusy(false);onNotice('Password verification failed.');return}
    const target=grant?secondaryTarget:secondary?.user_id
    const {error}=await supabase.rpc('set_secondary_super_user',{target_user:target,grant_access:grant,confirmation_text:confirmation.trim()})
    setBusy(false)
    if(error){onNotice(error.message);return}
    setConfirmation('');setPassword('');setSecondaryTarget('');await refresh();onNotice(grant?'Secondary Super User assigned.':'Secondary Super User revoked.')
  }
  return <div>
    <div className="admin-section-head"><div><h2>Administrators</h2><p>Super Users publish directly. Administrators and Content Leads submit changes for approval.</p></div></div>
    {isPrimary&&<section className="admin-panel admin-invite-form super-user-access-panel">
      <div><div className="eyebrow">Protected access</div><h3>Secondary Super User</h3><p>You may appoint one backup Super User. They cannot remove or downgrade your Primary Super User account.</p></div>
      {secondary?<><div className="member-edit"><span><strong>{secondary.display_name||secondary.email}</strong><small>{secondary.email}</small></span><span>Secondary Super User</span></div><label>Type REVOKE SUPER USER<input value={confirmation} onChange={(e)=>setConfirmation(e.target.value)}/></label><label>Your current password<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)}/></label><button className="danger-button" disabled={busy} onClick={()=>changeSecondary(false)}>{busy?'Verifying…':'Revoke Super User'}</button></>:<><label>Select registered administrator<select value={secondaryTarget} onChange={(e)=>setSecondaryTarget(e.target.value)}><option value="">Choose account…</option>{rows.filter((row)=>row.active&&row.role!=='owner'&&row.role!=='super_user').map((row)=><option key={row.user_id} value={row.user_id}>{row.display_name||row.email}</option>)}</select></label><label>Type GRANT SUPER USER<input value={confirmation} onChange={(e)=>setConfirmation(e.target.value)}/></label><label>Your current password<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)}/></label><button className="btn btn-primary" disabled={busy||!secondaryTarget} onClick={()=>changeSecondary(true)}>{busy?'Verifying…':'Assign Super User'}</button></>}
    </section>}
    <section className="admin-panel admin-invite-form admin-authorise-form">
      <label>Name<input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Dualist"/></label>
      <label>Email<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
      <label>Access level<select value={inviteRole} onChange={(e)=>setInviteRole(e.target.value as AdminRole)}><option value="website_admin">Administrator — all modules, approval required</option><option value="content_lead">Content Lead — members, teams, creators, media, brand and reports</option><option value="social_media_manager">Social Media Manager — Newsroom, Recruitment, Media submissions + Brand Pack read-only</option></select></label>
      <button className="btn btn-primary" onClick={addInvite}>Authorise HQ user</button>
    </section>
    <h3>Registered accounts</h3>
    <div className="admin-user-list admin-registered-list">{rows.map(row=><div className="member-edit" key={row.user_id}><span><strong>{row.display_name||row.email}</strong><small>{row.email}</small></span><select value={row.role} disabled={row.role==='owner'||row.role==='super_user'} onChange={(e)=>update(row.user_id,{role:e.target.value as AdminRole})}><option value="owner">Primary Super User</option><option value="super_user">Secondary Super User</option><option value="website_admin">Administrator</option><option value="content_lead">Content Lead</option><option value="social_media_manager">Social Media Manager</option></select><label><input type="checkbox" checked={row.active} disabled={row.role==='owner'||row.role==='super_user'} onChange={(e)=>update(row.user_id,{active:e.target.checked})}/> Active</label>{row.role!=='owner'&&row.role!=='super_user'&&<button className="danger-button" onClick={()=>update(row.user_id,{active:false})}>Revoke</button>}</div>)}</div>
    <h3>Authorised emails</h3>
    <div className="admin-user-list">{invites.map(invite=><div className="member-edit" key={invite.email}><span><strong>{invite.display_name||invite.email}</strong><small>{invite.email}</small></span><span>{invite.role==='website_admin'?'Administrator':invite.role==='social_media_manager'?'Social Media Manager':'Content Lead'}</span><span>{invite.active?'Authorised':'Revoked'}</span>{invite.active&&<button className="btn btn-secondary" onClick={()=>copySetupLink(invite.email)}>Copy setup link</button>}<button className={invite.active?'danger-button':'btn btn-secondary'} onClick={()=>invite.active?revokeInvite(invite.email):supabase.from('admin_invitations').update({active:true}).eq('email',invite.email).then(()=>refresh())}>{invite.active?'Revoke':'Restore'}</button></div>)}</div>
  </div>
}

function AccountSecurity({ onNotice }: { onNotice: (message: string) => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function changePassword() {
    if (password.length < 8) {
      onNotice('Use a password with at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      onNotice('The passwords do not match.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      onNotice(error.message)
      return
    }
    setPassword('')
    setConfirmPassword('')
    onNotice('Password updated successfully.')
  }

  return (
    <div>
      <div className="admin-section-head">
        <div>
          <h2>Account security</h2>
          <p>Change your own V6 HQ password without leaving the dashboard.</p>
        </div>
      </div>
      <section className="admin-panel account-security-panel">
        <label>
          New password
          <span className="password-control">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        <label>
          Confirm new password
          <span className="password-control">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
            <button type="button" className="password-toggle" onClick={() => setShowConfirm((value) => !value)}>
              {showConfirm ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        <p className="password-guidance">Use at least 8 characters. Both entries must match.</p>
        <button className="btn btn-primary" type="button" onClick={changePassword} disabled={busy}>
          {busy ? 'Updating…' : 'Change password'}
        </button>
      </section>
      <section className="admin-panel account-security-note">
        <h3>Forgotten password</h3>
        <p>Signed-out administrators can use the Forgot password link on the V6 HQ login screen.</p>
      </section>
    </div>
  )
}

function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <div className="admin-panel hq-coming-soon">
      <div className="eyebrow">HQ module</div>
      <h2>{title}</h2>
      <p>{text}</p>
      <span>Planned for the next sprint</span>
    </div>
  )
}

type WebsiteCMSProps={
 settings:SiteSettings; setSettings:(value:SiteSettings)=>void;
 content:WebsiteContent; setContent:(value:WebsiteContent)=>void;
 persist:(section:string,data:unknown)=>Promise<void>;
 uploadBrandImage:(kind:'logo'|'banner',file:File)=>Promise<void>;
}
function WebsiteCMS({settings,setSettings,content,setContent,persist,uploadBrandImage}:WebsiteCMSProps){
 const [section,setSection]=useState('homepage')
 const [saving,setSaving]=useState(false)
 const [savedAt,setSavedAt]=useState('')
 const [baseline,setBaseline]=useState(()=>JSON.stringify({settings,content}))
 const currentSnapshot=JSON.stringify({settings,content})
 const dirty=currentSnapshot!==baseline
 const update=(patch:Partial<WebsiteContent>)=>setContent({...content,...patch})
 const resetChanges=()=>{const previous=JSON.parse(baseline) as {settings:SiteSettings;content:WebsiteContent};setSettings(previous.settings);setContent(previous.content)}
 const saveAll=async()=>{
  if(!dirty||saving)return
  setSaving(true)
  try{
   await persist('settings',settings)
   await persist('websiteContent',content)
   setBaseline(JSON.stringify({settings,content}))
   setSavedAt(new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))
  }finally{setSaving(false)}
 }
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(!dirty)return;event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',warn)
  return()=>window.removeEventListener('beforeunload',warn)
 },[dirty])
 const sections=[['homepage','Homepage'],['pages','Public pages'],['logoHistory','Logo history'],['navigation','Navigation'],['sponsors','Sponsors'],['footer','Footer'],['appearance','Appearance'],['seo','SEO']]
 const pageFields=[
  ['About','/about','aboutEyebrow','aboutTitle','aboutDescription'],
  ['Roster','/roster','rosterEyebrow','rosterTitle','rosterDescription'],
  ['Media','/media','mediaEyebrow','mediaTitle','mediaDescription'],
  ['Brand Pack','/brand-pack','brandEyebrow','brandTitle','brandDescription'],
  ['Sponsors','/sponsors','sponsorsEyebrow','sponsorsTitle','sponsorsDescription'],
  ['Join Us','/join','joinEyebrow','joinTitle','joinDescription'],
 ] as const
 const moveNavigation=(id:string,direction:-1|1)=>{
  const ordered=[...content.navigation].sort((a,b)=>a.sortOrder-b.sortOrder)
  const index=ordered.findIndex(item=>item.id===id)
  const target=index+direction
  if(index<0||target<0||target>=ordered.length)return
  ;[ordered[index],ordered[target]]=[ordered[target],ordered[index]]
  update({navigation:ordered.map((item,sortOrder)=>({...item,sortOrder:sortOrder+1}))})
 }
 const logoHistory=Array.isArray(content.logoHistory)?content.logoHistory:defaultWebsiteContent.logoHistory
 const updateLogoHistory=(id:string,patch:Partial<(typeof logoHistory)[number]>)=>update({logoHistory:logoHistory.map(item=>item.id===id?{...item,...patch}:item)})
 const moveLogoHistory=(id:string,direction:-1|1)=>{
  const ordered=[...logoHistory].sort((a,b)=>a.sortOrder-b.sortOrder)
  const index=ordered.findIndex(item=>item.id===id);const target=index+direction
  if(index<0||target<0||target>=ordered.length)return
  ;[ordered[index],ordered[target]]=[ordered[target],ordered[index]]
  update({logoHistory:ordered.map((item,index)=>({...item,sortOrder:index+1}))})
 }
 const uploadLogoHistoryImage=async(id:string,file:File)=>{
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-')
  const path=`website/logo-history/${id}-${Date.now()}-${safe}`
  const upload=await supabase.storage.from('public-media').upload(path,file,{contentType:file.type,upsert:false})
  if(upload.error){alert(upload.error.message);return}
  const {data}=supabase.storage.from('public-media').getPublicUrl(path)
  updateLogoHistory(id,{image:data.publicUrl})
 }
 return <div className="website-cms">
  <div className="admin-section-head website-cms-head"><div><h2>Website CMS</h2><p>Edit and preview the public website without changing code.</p><div className={`cms-save-state${dirty?' is-dirty':''}`}>{dirty?'Unsaved website changes':savedAt?`Saved ${savedAt}`:'Everything is up to date'}</div></div><div className="cms-header-actions"><a className="btn btn-secondary" href="/" target="_blank" rel="noreferrer">Open live website ↗</a><button className="btn btn-secondary" disabled={!dirty||saving} onClick={resetChanges}>Discard changes</button><button className="btn btn-primary" disabled={!dirty||saving} onClick={saveAll}>{saving?'Saving…':dirty?'Save website changes':'Saved'}</button></div></div>
  <div className="website-cms-tabs">{sections.map(([id,label])=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}>{label}</button>)}</div>
  {section==='homepage'&&<section className="admin-panel settings-grid">
   <div className="cms-panel-heading full-width"><div><div className="eyebrow">Homepage</div><h3>Hero and announcement</h3></div><a href="/" target="_blank" rel="noreferrer">Preview page ↗</a></div>
   <label>Eyebrow<input value={content.heroEyebrow} onChange={e=>update({heroEyebrow:e.target.value})}/></label>
   <label>Hero title<input value={content.heroTitle} onChange={e=>update({heroTitle:e.target.value})}/></label>
   <label>Accent text<input value={content.heroAccent} onChange={e=>update({heroAccent:e.target.value})}/></label>
   <label className="full-width">Description<textarea value={content.heroDescription} onChange={e=>update({heroDescription:e.target.value})}/></label>
   <label>Primary button<input value={content.primaryButtonLabel} onChange={e=>update({primaryButtonLabel:e.target.value})}/></label>
   <label>Primary link<input value={content.primaryButtonHref} onChange={e=>update({primaryButtonHref:e.target.value})}/></label>
   <label>Secondary button<input value={content.secondaryButtonLabel} onChange={e=>update({secondaryButtonLabel:e.target.value})}/></label>
   <label>Secondary link<input value={content.secondaryButtonHref} onChange={e=>update({secondaryButtonHref:e.target.value})}/></label>
   <label className="full-width">Hero image URL<input value={content.heroImage} onChange={e=>update({heroImage:e.target.value})}/></label>
   <label className="cms-toggle-row full-width"><input type="checkbox" checked={content.announcementEnabled} onChange={e=>update({announcementEnabled:e.target.checked})}/><span><b>Show announcement banner</b><small>Display a site-wide message above the homepage hero.</small></span></label>
   <label>Announcement text<input disabled={!content.announcementEnabled} value={content.announcementText} onChange={e=>update({announcementText:e.target.value})}/></label>
   <label>Announcement link<input disabled={!content.announcementEnabled} value={content.announcementHref} onChange={e=>update({announcementHref:e.target.value})}/></label>
  </section>}
  {section==='pages'&&<section className="cms-page-list">{pageFields.map(([label,href,eyebrowKey,titleKey,descriptionKey])=><article className="admin-panel cms-page-card" key={href}><div className="cms-panel-heading"><div><div className="eyebrow">Public page</div><h3>{label}</h3></div><a href={href} target="_blank" rel="noreferrer">Preview ↗</a></div><div className="settings-grid"><label>Eyebrow<input value={content[eyebrowKey]} onChange={e=>update({[eyebrowKey]:e.target.value})}/></label><label>Page title<textarea className="cms-title-input" value={content[titleKey]} onChange={e=>update({[titleKey]:e.target.value})}/><small>Use a new line to control the desktop title break.</small></label><label className="full-width">Description<textarea value={content[descriptionKey]} onChange={e=>update({[descriptionKey]:e.target.value})}/></label></div></article>)}</section>}
  {section==='logoHistory'&&<section><div className="admin-section-head"><div><div className="eyebrow">About page</div><h3>Logo History</h3><p>Edit the existing timeline or add future Version6ix logos without changing code.</p></div><button className="btn btn-secondary" onClick={()=>update({logoHistory:[...logoHistory,{id:crypto.randomUUID(),label:'New logo',period:'',title:'New Identity',description:'',image:'',alt:'Version6ix logo',current:false,sortOrder:logoHistory.length+1}]})}>+ Add logo</button></div><div className="logo-history-admin-list">{[...logoHistory].sort((a,b)=>a.sortOrder-b.sortOrder).map((item,index,ordered)=><article className="admin-panel logo-history-admin-card" key={item.id}><div className="logo-history-admin-preview">{item.image?<img src={item.image} alt={item.alt||item.title}/>:<span>No image</span>}</div><div className="logo-history-admin-fields"><label>Label<input value={item.label} onChange={e=>updateLogoHistory(item.id,{label:e.target.value})}/></label><label>Period<input value={item.period} placeholder="2026 — Present" onChange={e=>updateLogoHistory(item.id,{period:e.target.value})}/></label><label>Title<input value={item.title} onChange={e=>updateLogoHistory(item.id,{title:e.target.value})}/></label><label>Image URL<input value={item.image} onChange={e=>updateLogoHistory(item.id,{image:e.target.value})}/></label><label className="full-width">Description<textarea value={item.description} onChange={e=>updateLogoHistory(item.id,{description:e.target.value})}/></label><label className="full-width">Image alt text<input value={item.alt} onChange={e=>updateLogoHistory(item.id,{alt:e.target.value})}/></label><div className="logo-history-admin-actions full-width"><label className="btn btn-secondary">Upload image<input hidden type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&uploadLogoHistoryImage(item.id,e.target.files[0])}/></label><label className="inline-check"><input type="checkbox" checked={item.current} onChange={e=>update({logoHistory:logoHistory.map(x=>({...x,current:x.id===item.id?e.target.checked:e.target.checked?false:x.current}))})}/>Current logo</label><button disabled={index===0} onClick={()=>moveLogoHistory(item.id,-1)}>↑ Move up</button><button disabled={index===ordered.length-1} onClick={()=>moveLogoHistory(item.id,1)}>↓ Move down</button><button className="danger-button" onClick={()=>{if(window.confirm(`Remove ${item.title||'this logo'} from Logo History?`))update({logoHistory:logoHistory.filter(x=>x.id!==item.id)})}}>Remove</button></div></div></article>)}</div></section>}
  {section==='navigation'&&<section className="admin-panel"><div className="cms-panel-heading"><div><div className="eyebrow">Website structure</div><h3>Navigation</h3></div><span>Drag-free ordering controls</span></div><div className="navigation-edit-labels"><span>Label</span><span>Destination</span><span>Order</span><span>Display</span><span>Style</span><span></span></div>{[...content.navigation].sort((a,b)=>a.sortOrder-b.sortOrder).map((item,index,ordered)=><div className="navigation-edit-row" key={item.id}><input aria-label={`${item.label} label`} value={item.label} onChange={e=>update({navigation:content.navigation.map(x=>x.id===item.id?{...x,label:e.target.value}:x)})}/><input aria-label={`${item.label} destination`} value={item.href} onChange={e=>update({navigation:content.navigation.map(x=>x.id===item.id?{...x,href:e.target.value}:x)})}/><div className="nav-order-actions"><button disabled={index===0} onClick={()=>moveNavigation(item.id,-1)} aria-label={`Move ${item.label} up`}>↑</button><button disabled={index===ordered.length-1} onClick={()=>moveNavigation(item.id,1)} aria-label={`Move ${item.label} down`}>↓</button></div><label className="inline-check"><input type="checkbox" checked={item.visible} onChange={e=>update({navigation:content.navigation.map(x=>x.id===item.id?{...x,visible:e.target.checked}:x)})}/>Visible</label><label className="inline-check"><input type="checkbox" checked={!!item.highlight} onChange={e=>update({navigation:content.navigation.map(x=>x.id===item.id?{...x,highlight:e.target.checked}:x)})}/>Button</label><a className="cms-row-preview" href={item.href} target="_blank" rel="noreferrer">↗</a></div>)}</section>}
  {section==='sponsors'&&<section><div className="admin-section-head"><div><h3>Sponsors</h3><p>Control partner information shown on the public Sponsors page.</p></div><button className="btn btn-secondary" onClick={()=>update({sponsors:[...content.sponsors,{id:crypto.randomUUID(),name:'New Sponsor',logo:'',website:'',discountCode:'',featured:false,visible:true}]})}>Add sponsor</button></div>{content.sponsors.length===0&&<div className="admin-panel cms-empty-state"><h3>No CMS-managed sponsors yet</h3><p>The current Dubby feature remains available on the public page. Add a sponsor here when you want to manage additional partner cards through HQ.</p></div>}{content.sponsors.map(sponsor=><div className="admin-panel sponsor-edit" key={sponsor.id}><label>Name<input value={sponsor.name} onChange={e=>update({sponsors:content.sponsors.map(x=>x.id===sponsor.id?{...x,name:e.target.value}:x)})}/></label><label>Logo URL<input value={sponsor.logo} onChange={e=>update({sponsors:content.sponsors.map(x=>x.id===sponsor.id?{...x,logo:e.target.value}:x)})}/></label><label>Website<input value={sponsor.website} onChange={e=>update({sponsors:content.sponsors.map(x=>x.id===sponsor.id?{...x,website:e.target.value}:x)})}/></label><label>Discount code<input value={sponsor.discountCode} onChange={e=>update({sponsors:content.sponsors.map(x=>x.id===sponsor.id?{...x,discountCode:e.target.value}:x)})}/></label><label className="inline-check"><input type="checkbox" checked={sponsor.visible} onChange={e=>update({sponsors:content.sponsors.map(x=>x.id===sponsor.id?{...x,visible:e.target.checked}:x)})}/>Visible</label><label className="inline-check"><input type="checkbox" checked={sponsor.featured} onChange={e=>update({sponsors:content.sponsors.map(x=>x.id===sponsor.id?{...x,featured:e.target.checked}:x)})}/>Featured</label><button className="danger-button" onClick={()=>{if(window.confirm(`Remove ${sponsor.name}?`))update({sponsors:content.sponsors.filter(x=>x.id!==sponsor.id)})}}>Remove</button></div>)}</section>}
  {section==='footer'&&<section className="admin-panel settings-grid"><div className="cms-panel-heading full-width"><div><div className="eyebrow">Global content</div><h3>Footer and social links</h3></div></div><label>Footer tagline<input value={content.footerTagline} onChange={e=>update({footerTagline:e.target.value})}/></label><label>Copyright text<input value={content.copyrightText} onChange={e=>update({copyrightText:e.target.value})}/></label><label>TikTok URL<input value={content.tiktokUrl} onChange={e=>update({tiktokUrl:e.target.value})}/></label><label>YouTube URL<input value={content.youtubeUrl} onChange={e=>update({youtubeUrl:e.target.value})}/></label><label>Discord URL<input value={content.discordUrl} onChange={e=>update({discordUrl:e.target.value})}/></label><label>X URL<input value={content.xUrl} onChange={e=>update({xUrl:e.target.value})}/></label></section>}
  {section==='appearance'&&<section className="admin-panel settings-grid"><div className="cms-panel-heading full-width"><div><div className="eyebrow">Design system</div><h3>Appearance</h3></div></div>{(['primary','background','surface','text','muted'] as const).map(key=><label key={key}>{key}<div className="cms-colour-field"><input type="color" value={settings[key]} onChange={e=>setSettings({...settings,[key]:e.target.value})}/><code>{settings[key]}</code></div></label>)}<label>Heading font<input value={settings.headingFont} onChange={e=>setSettings({...settings,headingFont:e.target.value})}/></label><label>Body font<input value={settings.bodyFont} onChange={e=>setSettings({...settings,bodyFont:e.target.value})}/></label><label>Base size<input type="number" min="12" max="22" value={settings.baseSize} onChange={e=>setSettings({...settings,baseSize:Number(e.target.value)})}/></label><label className="btn btn-secondary">Replace logo<input hidden type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&uploadBrandImage('logo',e.target.files[0])}/></label><label className="btn btn-secondary">Replace banner<input hidden type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&uploadBrandImage('banner',e.target.files[0])}/></label></section>}
  {section==='seo'&&<section className="admin-panel settings-grid"><div className="cms-panel-heading full-width"><div><div className="eyebrow">Search and sharing</div><h3>SEO</h3></div></div><label>Page title<input value={content.seoTitle} onChange={e=>update({seoTitle:e.target.value})}/><small>{content.seoTitle.length}/60 characters</small></label><label className="full-width">Description<textarea value={content.seoDescription} onChange={e=>update({seoDescription:e.target.value})}/><small>{content.seoDescription.length}/160 characters</small></label><label>Keywords<input value={content.seoKeywords} onChange={e=>update({seoKeywords:e.target.value})}/></label><label>Social image URL<input value={content.socialImage} onChange={e=>update({socialImage:e.target.value})}/></label><label>Favicon URL<input value={content.favicon} onChange={e=>update({favicon:e.target.value})}/></label></section>}
 </div>
}



function ServiceRequestsPanel({providers,services,onNotice}:{providers:ServiceProvider[];services:CreativeService[];onNotice:(message:string)=>void}){
  const [requests,setRequests]=useState<ServiceRequest[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState<'active'|'all'>('active')
  useEffect(()=>{loadServiceRequests().then(setRequests).finally(()=>setLoading(false))},[])
  const visible=requests.filter(item=>filter==='all'||!['completed','declined','archived'].includes(item.status))
  const statusOptions:ServiceRequestStatus[]=['new','contacted','awaiting_reply','accepted','in_progress','completed','declined','archived']
  async function save(request:ServiceRequest){await updateServiceRequest(request);setRequests(current=>current.map(item=>item.id===request.id?request:item));onNotice('Service request updated.');await recordActivity('updated_service_request','services',{requestId:request.id,status:request.status})}
  return <section className="admin-panel service-requests-panel"><div className="admin-section-head"><div><div className="eyebrow">Enquiry tracking</div><h3>Service requests</h3><p>Track incoming enquiries before the Discord seller workflow is connected.</p></div><div className="admin-section-actions"><button className={filter==='active'?'btn btn-primary':'btn recruitment-cancel'} onClick={()=>setFilter('active')}>Active</button><button className={filter==='all'?'btn btn-primary':'btn recruitment-cancel'} onClick={()=>setFilter('all')}>All</button></div></div>{loading?<div className="service-request-empty">Loading requests…</div>:visible.length===0?<div className="service-request-empty">No service requests yet.</div>:<div className="service-request-list">{visible.map(request=>{const service=services.find(item=>item.id===request.serviceId);const provider=providers.find(item=>item.id===request.assignedProviderId||item.id===request.providerId);return <article className="service-request-row" key={request.id}><div><h4>{request.customerName} · {service?.title||'Service request'}</h4><p>{request.discord}{request.budget?` · ${request.budget}`:''}{request.deadline?` · Due ${request.deadline}`:''}</p><small>{request.description}</small></div><select value={request.assignedProviderId} onChange={e=>setRequests(current=>current.map(item=>item.id===request.id?{...item,assignedProviderId:e.target.value}:item))}>{providers.map(item=><option value={item.id} key={item.id}>{item.displayName}</option>)}</select><select value={request.status} onChange={e=>{const next={...request,status:e.target.value as ServiceRequestStatus,updatedAt:new Date().toISOString()};setRequests(current=>current.map(item=>item.id===request.id?next:item));save(next)}}>{statusOptions.map(status=><option value={status} key={status}>{status.replaceAll('_',' ')}</option>)}</select><div className="service-request-notes"><textarea placeholder="Internal notes" value={request.internalNotes} onChange={e=>setRequests(current=>current.map(item=>item.id===request.id?{...item,internalNotes:e.target.value}:item))}/><button className="btn recruitment-cancel" onClick={()=>save(request)}>Save notes</button></div></article>})}</div>}</section>
}

function NewsroomManager({articles,setArticles,discordSettings,teams,isSuperUser,isSocialManager,onNotice,refreshApprovals}:{articles:NewsArticle[];setArticles:Dispatch<SetStateAction<NewsArticle[]>>;discordSettings:DiscordSettings;setDiscordSettings:Dispatch<SetStateAction<DiscordSettings>>;teams:Team[];isSuperUser:boolean;isSocialManager:boolean;onNotice:(m:string)=>void;refreshApprovals:()=>Promise<void>}){
 const [editing,setEditing]=useState<NewsArticle|null>(null)
 const [templatePicker,setTemplatePicker]=useState(false)
 const [discordPreview,setDiscordPreview]=useState(false)
 const [newsSettings,setNewsSettings]=useState<NewsSettings>(defaultNewsSettings)
 const [modeText,setModeText]=useState(defaultNewsSettings.scrimGameModes.join(', '))
 const [warzoneModeText,setWarzoneModeText]=useState(defaultNewsSettings.warzoneGameModes.join(', '))
 useEffect(()=>{loadNewsSettings().then(settings=>{setNewsSettings(settings);setModeText(settings.scrimGameModes.join(', '));setWarzoneModeText(settings.warzoneGameModes.join(', '))})},[])
 const ageHours=(a:NewsArticle)=>a.publishedAt?(Date.now()-new Date(a.publishedAt).getTime())/3600000:0
 const protectedPost=(a:NewsArticle)=>Boolean(a.publishedAt&&ageHours(a)>=24)
 const isScrim=(a:NewsArticle)=>a.postType==='scrim'||Boolean(a.scrim)
 const isTournament=(a:NewsArticle)=>a.postType==='warzone_tournament'||Boolean(a.warzoneTournament)
 const isResult=(a:NewsArticle)=>isScrim(a)||isTournament(a)
 const scrimTeamOrder=['reg','sniper']
 const scrimTeams=[...teams].filter(team=>scrimTeamOrder.includes(team.id)&&team.active!==false).sort((a,b)=>scrimTeamOrder.indexOf(a.id)-scrimTeamOrder.indexOf(b.id))
 const warzoneTeam=teams.find(team=>team.id==='warzone')
 const ordinal=(value:number)=>{const mod100=value%100;if(mod100>=11&&mod100<=13)return `${value}th`;switch(value%10){case 1:return `${value}st`;case 2:return `${value}nd`;case 3:return `${value}rd`;default:return `${value}th`}}
 const blankMap=(mapNumber:number)=>({mapNumber,mapName:'',mode:newsSettings.scrimGameModes[0]||'Hardpoint',score:'',outcome:'win' as const})
 const blankTournamentGame=(gameNumber:number)=>({gameNumber,mode:newsSettings.warzoneGameModes[0]||'Resurgence',placement:1 as number|null,points:'',kills:''})
 const blankStandings=()=>[{place:1 as const,teamName:'v6',score:''},{place:2 as const,teamName:'',score:''},{place:3 as const,teamName:'',score:''}]
 const fresh=(postType:'general'|'scrim'|'warzone_tournament'):NewsArticle=>{
   const now=new Date().toISOString()
   const base:NewsArticle={id:crypto.randomUUID(),title:'',slug:'',category:postType==='scrim'?'Scrim Result':postType==='warzone_tournament'?'Warzone Tournament':'Team News',excerpt:'',body:'',coverImage:'',authorName:'Version6ix',status:'draft',featured:false,socialCaption:'',autoPostX:false,postType,postToDiscord:false,discordMention:'none',createdAt:now,publishedAt:'',updatedAt:now}
   if(postType==='scrim')base.scrim={teamId:scrimTeams[0]?.id||'reg',teamName:scrimTeams[0]?.publicName||'Reg Team',opponent:'',overallScore:'',outcome:'win',includeMapBreakdown:false,maps:Array.from({length:5},(_,index)=>blankMap(index+1)),mvp:'',notes:''}
   if(postType==='warzone_tournament')base.warzoneTournament={teamId:'warzone',teamName:warzoneTeam?.publicName||'Warzone Team',tournamentName:'',format:'points',gameCount:3,fieldSize:16,overallPlacement:1,totalPoints:'',totalKills:'',includeGameBreakdown:true,games:Array.from({length:10},(_,index)=>blankTournamentGame(index+1)),standings:blankStandings(),mvp:'',notes:''}
   return base
 }
 const discordText=(a:NewsArticle)=>{const mention=a.discordMention==='everyone'?'@everyone':a.discordMention==='team'?'@team':'';return [mention,`**${a.title||'Article headline'}**`,a.socialCaption||a.excerpt||'Article summary',`Read more: v6era.co.uk/news/article?id=${a.id}`].filter(Boolean).join('\n\n')}
 const openEdit=(article:NewsArticle)=>{
   const copy=structuredClone(article)
   if(isScrim(copy)&&copy.scrim){const saved=copy.scrim.maps||[];copy.scrim.maps=Array.from({length:5},(_,index)=>saved.find(map=>map.mapNumber===index+1)||blankMap(index+1))}
   if(isTournament(copy)&&copy.warzoneTournament){const saved=copy.warzoneTournament.games||[];copy.warzoneTournament.games=Array.from({length:10},(_,index)=>saved.find(game=>game.gameNumber===index+1)||blankTournamentGame(index+1));copy.warzoneTournament.standings=copy.warzoneTournament.standings?.length?copy.warzoneTournament.standings:blankStandings()}
   setEditing(copy);setDiscordPreview(false)
 }
 const updateScrim=(patch:Partial<NonNullable<NewsArticle['scrim']>>)=>setEditing(current=>current?.scrim?{...current,scrim:{...current.scrim,...patch}}:current)
 const updateScrimMap=(mapNumber:number,patch:Partial<NonNullable<NewsArticle['scrim']>['maps'][number]>)=>setEditing(current=>{if(!current?.scrim)return current;return{...current,scrim:{...current.scrim,maps:current.scrim.maps.map(map=>map.mapNumber===mapNumber?{...map,...patch}:map)}}})
 const updateTournament=(patch:Partial<NonNullable<NewsArticle['warzoneTournament']>>)=>setEditing(current=>current?.warzoneTournament?{...current,warzoneTournament:{...current.warzoneTournament,...patch}}:current)
 const updateTournamentGame=(gameNumber:number,patch:Partial<NonNullable<NewsArticle['warzoneTournament']>['games'][number]>)=>setEditing(current=>{if(!current?.warzoneTournament)return current;return{...current,warzoneTournament:{...current.warzoneTournament,games:current.warzoneTournament.games.map(game=>game.gameNumber===gameNumber?{...game,...patch}:game)}}})
 const updateStanding=(place:1|2|3,patch:Partial<NonNullable<NewsArticle['warzoneTournament']>['standings'][number]>)=>setEditing(current=>{if(!current?.warzoneTournament)return current;return{...current,warzoneTournament:{...current.warzoneTournament,standings:current.warzoneTournament.standings.map(row=>row.place===place?{...row,...patch}:row)}}})
 const updateOverallPlacement=(placement:number)=>setEditing(current=>{if(!current?.warzoneTournament)return current;const standings=current.warzoneTournament.standings.map(row=>({...row,teamName:row.teamName.toLowerCase()==='v6'?'':row.teamName}));if(placement<=3){const target=standings.find(row=>row.place===placement);if(target)target.teamName='v6'}return{...current,warzoneTournament:{...current.warzoneTournament,overallPlacement:placement,standings}}})
 const saveModes=async()=>{
   const modes=Array.from(new Set(modeText.split(',').map(value=>value.trim()).filter(Boolean)))
   const warzoneModes=Array.from(new Set(warzoneModeText.split(',').map(value=>value.trim()).filter(Boolean)))
   if(!modes.length||!warzoneModes.length){onNotice('Keep at least one scrim mode and one Warzone mode.');return}
   try{const settings={scrimGameModes:modes,warzoneGameModes:warzoneModes};await saveSection('newsSettings',settings);setNewsSettings(settings);setModeText(modes.join(', '));setWarzoneModeText(warzoneModes.join(', '));onNotice('Result game modes updated.')}catch(error){onNotice(error instanceof Error?error.message:'Could not save result settings.')}
 }
 const save=async()=>{
   if(!editing)return
   let article={...editing,updatedAt:new Date().toISOString()}
   if(isScrim(article)){
     const scrim=article.scrim
     if(!scrim?.teamId){onNotice('Choose the V6 team for this scrim.');return}
     if(!scrim.opponent.trim()){onNotice('Add the opposing team name.');return}
     if(!scrim.overallScore.trim()){onNotice('Add the overall series score, for example 3-0.');return}
     const team=scrimTeams.find(item=>item.id===scrim.teamId)
     const maps=scrim.includeMapBreakdown?scrim.maps.filter(map=>map.mapName.trim()||map.score.trim()):[]
     if(scrim.includeMapBreakdown){for(const map of maps){if(!map.mapName.trim()||!map.mode.trim()||!map.score.trim()){onNotice(`Complete Map ${map.mapNumber} or leave the whole row blank.`);return}}}
     const teamName=team?.publicName||scrim.teamName||scrim.teamId
     const resultWord=scrim.outcome==='win'?'Win':'Loss'
     const cleanScrim={...scrim,teamName,opponent:scrim.opponent.trim(),overallScore:scrim.overallScore.trim(),maps}
     article={...article,postType:'scrim',scrim:cleanScrim,warzoneTournament:undefined,title:`v6 vs ${cleanScrim.opponent} — ${cleanScrim.overallScore}`,category:'Scrim Result',excerpt:`${teamName} · ${resultWord} · v6 ${cleanScrim.overallScore} ${cleanScrim.opponent}`,body:cleanScrim.notes,coverImage:'',featured:false,socialCaption:article.socialCaption.trim()||`${resultWord.toUpperCase()} | ${teamName} — v6 ${cleanScrim.overallScore} ${cleanScrim.opponent}`}
   }else if(isTournament(article)){
     const tournament=article.warzoneTournament
     if(!tournament?.tournamentName.trim()){onNotice('Add the tournament name.');return}
     if(tournament.fieldSize<3){onNotice('Tournament field size must be at least 3 teams.');return}
     if(tournament.overallPlacement<1||tournament.overallPlacement>tournament.fieldSize){onNotice('Overall placement must be within the tournament field size.');return}
     if(tournament.format==='points'&&!tournament.totalPoints.trim()){onNotice('Add V6 total tournament points.');return}
     if(tournament.format==='kill_race'&&!tournament.totalKills.trim()){onNotice('Add V6 total kills for the kill race.');return}
     const activeGames=tournament.includeGameBreakdown?tournament.games.slice(0,tournament.gameCount):[]
     if(tournament.includeGameBreakdown){for(const game of activeGames){if(!game.mode.trim()){onNotice(`Choose a mode for Map ${game.gameNumber}.`);return}if(tournament.format==='points'){if(!game.placement||!game.points.trim()){onNotice(`Map ${game.gameNumber} needs placement and points.`);return}}else if(!game.kills.trim()){onNotice(`Map ${game.gameNumber} needs kills for a Kill Race.`);return}}}
     const standings=tournament.standings.map(row=>({...row,teamName:row.teamName.trim(),score:row.score.trim()}))
     if(standings.some(row=>!row.teamName)){onNotice('Complete the 1st, 2nd and 3rd place final standings.');return}
     const teamName=warzoneTeam?.publicName||tournament.teamName||'Warzone Team'
     const metric=tournament.format==='points'?`${tournament.totalPoints.trim()} pts`:`${tournament.totalKills.trim()} kills`
     const cleanTournament={...tournament,teamName,tournamentName:tournament.tournamentName.trim(),gameCount:Math.max(1,Math.min(10,tournament.gameCount)),fieldSize:Math.max(3,Math.min(50,tournament.fieldSize)),games:activeGames,standings}
     article={...article,postType:'warzone_tournament',scrim:undefined,warzoneTournament:cleanTournament,title:`${cleanTournament.tournamentName} — ${ordinal(cleanTournament.overallPlacement)}`,category:'Warzone Tournament',excerpt:`${teamName} · ${ordinal(cleanTournament.overallPlacement)} Place · ${metric}`,body:cleanTournament.notes,coverImage:'',featured:false,socialCaption:article.socialCaption.trim()||`${ordinal(cleanTournament.overallPlacement).toUpperCase()} PLACE | ${cleanTournament.tournamentName} — ${metric}`}
   }else{
     if(!article.title.trim()){onNotice('Add an article title first.');return}
     article={...article,postType:'general',scrim:undefined,warzoneTournament:undefined}
   }
   article.slug=article.slug||article.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
   if(article.status==='published'&&!article.publishedAt)article.publishedAt=new Date().toISOString()
   if(article.discordMention==='everyone'&&!discordSettings.allowEveryone){onNotice('@everyone is disabled by the Super User.');return}
   if(article.discordMention==='team'&&(!discordSettings.allowTeam||!discordSettings.teamRoleId)){onNotice('@team is not configured or is disabled.');return}
   const exists=articles.some(x=>x.id===article.id),next=exists?articles.map(x=>x.id===article.id?article:x):[article,...articles]
   try{
     let direct=false
     if(isSuperUser){await saveSection('newsArticles',next);direct=true;onNotice(isTournament(article)?'Warzone tournament result saved.':isScrim(article)?'Scrim result saved.':'Article published successfully.')}
     else if(isSocialManager&&(!exists||!protectedPost(articles.find(x=>x.id===article.id)!))){const {error}=await supabase.rpc('social_save_recent_section',{section_name:'newsArticles',proposed_data:next});if(error)throw error;direct=true;onNotice(isResult(article)?'Result saved.':'Article saved.')}
     else{await submitChange('newsArticles',next);await refreshApprovals();onNotice('This post is protected. Changes submitted for approval.')}
     setArticles(next)
     await recordActivity(exists?'news_article_updated':'news_article_created','newsroom',{id:article.id,title:article.title,status:article.status,postType:article.postType})
     if(direct&&article.status==='published'&&article.postToDiscord&&!article.discordPostedAt){try{const sent=await publishNewsToDiscord(article);const delivered={...article,discordPostedAt:sent.postedAt,discordMessageId:sent.messageId};setArticles(current=>current.map(x=>x.id===delivered.id?delivered:x));onNotice(`${isResult(article)?'Result':'Article'} published and posted to Discord.`)}catch(error){onNotice(`Published, but Discord failed: ${error instanceof Error?error.message:'delivery error'}`)}}
     setEditing(null);setDiscordPreview(false)
   }catch(error){onNotice(error instanceof Error?error.message:'Save failed')}
 }
 const remove=async(a:NewsArticle)=>{const next=articles.filter(x=>x.id!==a.id);try{if(isSuperUser){await saveSection('newsArticles',next);setArticles(next);onNotice('Post deleted.')}else if(isSocialManager&&!protectedPost(a)){const {error}=await supabase.rpc('social_save_recent_section',{section_name:'newsArticles',proposed_data:next});if(error)throw error;setArticles(next);onNotice('Post deleted.')}else{await submitChange('newsArticles',next);await refreshApprovals();onNotice('Deletion submitted for approval. The live post is unchanged.')}await recordActivity('news_article_delete_requested','newsroom',{id:a.id,title:a.title})}catch(error){onNotice(error instanceof Error?error.message:'Delete failed')}}
 const postKind=(a:NewsArticle)=>isTournament(a)?'Warzone Tournament':isScrim(a)?'Scrim Result':'News / Announcement'
 return <div>
  <div className="admin-section-head"><div><div className="eyebrow">Publishing</div><h2>Newsroom</h2><p>Create announcements, Reg/Sniper scrim results and structured Warzone tournament results. Published posts become protected after 24 hours.</p></div><button className="btn btn-primary" onClick={()=>setTemplatePicker(true)}>+ New post</button></div>
  {isSuperUser&&<section className="admin-panel newsroom-result-settings"><div><div className="eyebrow">Result configuration</div><h3>Game modes</h3><p>Update the dropdown values here whenever a competitive ruleset changes.</p></div><label>Reg / Sniper scrim modes<input value={modeText} onChange={event=>setModeText(event.target.value)} placeholder="Hardpoint, Overload, SND"/></label><label>Warzone modes<input value={warzoneModeText} onChange={event=>setWarzoneModeText(event.target.value)} placeholder="Blackout, Battle Royale, Resurgence"/></label><button className="btn btn-secondary" onClick={saveModes}>Save modes</button></section>}
  <div className="newsroom-list">{[...articles].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(a=><article className={`admin-panel newsroom-card ${isResult(a)?'is-scrim':''}`} key={a.id}><div><div className="eyebrow">{isTournament(a)?`${a.warzoneTournament?.teamName||'Warzone Team'} · ${ordinal(a.warzoneTournament?.overallPlacement||1)} Place`:isScrim(a)?`${a.scrim?.teamName||'Scrim Result'} · ${a.scrim?.outcome==='loss'?'Loss':'Win'}`:`${a.category} · ${a.status}`}</div><h3>{a.title||'Untitled article'}</h3><small>{a.publishedAt?`Published ${new Date(a.publishedAt).toLocaleString('en-GB')}`:'Not published'}{a.discordPostedAt?` · Discord sent ${new Date(a.discordPostedAt).toLocaleString('en-GB')}`:''}</small></div><div className="recruitment-admin-actions">{isTournament(a)&&<span className="tournament-place-pill">{ordinal(a.warzoneTournament?.overallPlacement||1)}</span>}{isScrim(a)&&<span className={`scrim-result-pill ${a.scrim?.outcome||'win'}`}>{a.scrim?.overallScore||'—'}</span>}{protectedPost(a)&&<span className="protection-badge">Protected · approval required</span>}<button onClick={()=>openEdit(a)}>Edit</button>{a.status==='published'&&<a href={`/news/article?id=${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer">View ↗</a>}<button className="danger-button" onClick={()=>remove(a)}>{protectedPost(a)&&!isSuperUser?'Request deletion':'Delete'}</button></div></article>)}</div>
  {templatePicker&&<div className="recruitment-modal-scrim"><section className="recruitment-editor news-template-picker" role="dialog" aria-modal="true"><header className="recruitment-editor-head"><div><div className="eyebrow">Create post</div><h2>Choose a template</h2><p>Select the structure that matches what you are publishing.</p></div><button className="recruitment-close" onClick={()=>setTemplatePicker(false)}>×</button></header><div className="news-template-grid"><button onClick={()=>{setEditing(fresh('general'));setTemplatePicker(false)}}><span>01</span><strong>News / Announcement</strong><small>General team news, announcements, recruitment updates and longer articles.</small></button><button onClick={()=>{setEditing(fresh('scrim'));setTemplatePicker(false)}}><span>02</span><strong>Scrim Result</strong><small>Reg or Sniper best-of-five result with optional map-by-map breakdown and MVP.</small></button><button onClick={()=>{setEditing(fresh('warzone_tournament'));setTemplatePicker(false)}}><span>03</span><strong>Warzone Tournament</strong><small>Points tournament or kill race with placement, map results and final standings.</small></button></div></section></div>}
  {editing&&<div className="recruitment-modal-scrim"><section className="recruitment-editor" role="dialog" aria-modal="true"><header className="recruitment-editor-head"><div><div className="eyebrow">Newsroom · {postKind(editing)}</div><h2>{articles.some(x=>x.id===editing.id)?`Edit ${postKind(editing).toLowerCase()}`:`Create ${postKind(editing).toLowerCase()}`}</h2></div><button className="recruitment-close" onClick={()=>setEditing(null)}>×</button></header><div className="recruitment-form newsroom-editor">
   {isScrim(editing)&&editing.scrim?<>
     <div className="wide scrim-editor-scoreboard"><div><span>{editing.scrim.teamName||'V6 Team'}</span><strong>v6</strong></div><b>VS</b><div><span>Opponent</span><strong>{editing.scrim.opponent||'—'}</strong></div><em className={editing.scrim.outcome}>{editing.scrim.overallScore||'0-0'} · {editing.scrim.outcome==='win'?'WIN':'LOSS'}</em></div>
     <label>V6 team<select value={editing.scrim.teamId} onChange={event=>{const team=scrimTeams.find(item=>item.id===event.target.value);updateScrim({teamId:event.target.value,teamName:team?.publicName||event.target.value})}}>{scrimTeams.map(team=><option key={team.id} value={team.id}>{team.publicName}</option>)}</select></label>
     <label>Opponent<input autoFocus value={editing.scrim.opponent} onChange={event=>updateScrim({opponent:event.target.value})} placeholder="e.g. 2seC"/></label>
     <label>Overall score<input value={editing.scrim.overallScore} onChange={event=>updateScrim({overallScore:event.target.value})} placeholder="e.g. 3-0"/></label>
     <label>Series result<select value={editing.scrim.outcome} onChange={event=>updateScrim({outcome:event.target.value as 'win'|'loss'})}><option value="win">Win</option><option value="loss">Loss</option></select></label>
     <label className="wide">MVP <small>(optional)</small><input value={editing.scrim.mvp} onChange={event=>updateScrim({mvp:event.target.value})} placeholder="Player name"/></label>
     <label className="featured-toggle wide"><span><strong>Include map breakdown</strong><small>Optional. Turn this on to publish individual Map 1–5 results.</small></span><input type="checkbox" checked={editing.scrim.includeMapBreakdown} onChange={event=>updateScrim({includeMapBreakdown:event.target.checked})}/><i/></label>
     {editing.scrim.includeMapBreakdown&&<div className="wide scrim-map-editor-list">{editing.scrim.maps.map(map=><section className="scrim-map-editor" key={map.mapNumber}><strong>Map {map.mapNumber}</strong><label>Map name<input value={map.mapName} onChange={event=>updateScrimMap(map.mapNumber,{mapName:event.target.value})} placeholder="e.g. Scar"/></label><label>Mode<select value={map.mode} onChange={event=>updateScrimMap(map.mapNumber,{mode:event.target.value})}>{Array.from(new Set([map.mode,...newsSettings.scrimGameModes])).filter(Boolean).map(mode=><option key={mode} value={mode}>{mode}</option>)}</select></label><label>Result<input value={map.score} onChange={event=>updateScrimMap(map.mapNumber,{score:event.target.value})} placeholder="e.g. 255-200"/></label><label>Map result<select value={map.outcome} onChange={event=>updateScrimMap(map.mapNumber,{outcome:event.target.value as 'win'|'loss'})}><option value="win">Win</option><option value="loss">Loss</option></select></label></section>)}</div>}
     <label className="wide">Additional notes <small>(optional)</small><textarea rows={5} value={editing.scrim.notes} onChange={event=>updateScrim({notes:event.target.value})} placeholder="Any extra context you want shown when the result is opened."/></label>
   </>:isTournament(editing)&&editing.warzoneTournament?<>
     <div className="wide tournament-editor-summary"><div><span>Warzone Team</span><strong>{editing.warzoneTournament.tournamentName||'Tournament name'}</strong></div><em>{ordinal(editing.warzoneTournament.overallPlacement)} PLACE</em><small>{editing.warzoneTournament.format==='points'?(editing.warzoneTournament.totalPoints?`${editing.warzoneTournament.totalPoints} pts`:'Points Tournament'):(editing.warzoneTournament.totalKills?`${editing.warzoneTournament.totalKills} kills`:'Kill Race')}</small></div>
     <label className="wide">Tournament name<input autoFocus value={editing.warzoneTournament.tournamentName} onChange={event=>updateTournament({tournamentName:event.target.value})} placeholder="e.g. EUSL Warzone Invitational"/></label>
     <label>Tournament format<select value={editing.warzoneTournament.format} onChange={event=>updateTournament({format:event.target.value as 'points'|'kill_race'})}><option value="points">Points Tournament</option><option value="kill_race">Kill Race</option></select></label>
     <label>Number of maps / games<select value={editing.warzoneTournament.gameCount} onChange={event=>updateTournament({gameCount:Number(event.target.value)})}>{Array.from({length:10},(_,index)=>index+1).map(value=><option key={value} value={value}>{value}</option>)}</select></label>
     <label>Field size (teams)<input type="number" min="3" max="50" value={editing.warzoneTournament.fieldSize} onChange={event=>{const fieldSize=Math.max(3,Math.min(50,Number(event.target.value)||3));updateTournament({fieldSize,overallPlacement:Math.min(editing.warzoneTournament!.overallPlacement,fieldSize)})}}/></label>
     <label>Overall placement<select value={editing.warzoneTournament.overallPlacement} onChange={event=>updateOverallPlacement(Number(event.target.value))}>{Array.from({length:editing.warzoneTournament.fieldSize},(_,index)=>index+1).map(value=><option value={value} key={value}>{ordinal(value)}</option>)}</select></label>
     {editing.warzoneTournament.format==='points'?<><label>Total points<input value={editing.warzoneTournament.totalPoints} onChange={event=>updateTournament({totalPoints:event.target.value})} placeholder="e.g. 89"/></label><label>Total kills <small>(optional)</small><input value={editing.warzoneTournament.totalKills} onChange={event=>updateTournament({totalKills:event.target.value})} placeholder="e.g. 58"/></label></>:<><label>Total kills<input value={editing.warzoneTournament.totalKills} onChange={event=>updateTournament({totalKills:event.target.value})} placeholder="e.g. 74"/></label><label>Total points <small>(optional)</small><input value={editing.warzoneTournament.totalPoints} onChange={event=>updateTournament({totalPoints:event.target.value})} placeholder="If the event also awards points"/></label></>}
     <label className="wide">MVP <small>(optional)</small><input value={editing.warzoneTournament.mvp} onChange={event=>updateTournament({mvp:event.target.value})} placeholder="Player name"/></label>
     <label className="featured-toggle wide"><span><strong>Include map breakdown</strong><small>{editing.warzoneTournament.format==='points'?'Placement and points are required per map; kills are optional.':'Kills are required per map; placement and points are optional.'}</small></span><input type="checkbox" checked={editing.warzoneTournament.includeGameBreakdown} onChange={event=>updateTournament({includeGameBreakdown:event.target.checked})}/><i/></label>
     {editing.warzoneTournament.includeGameBreakdown&&<div className="wide tournament-game-editor-list">{editing.warzoneTournament.games.slice(0,editing.warzoneTournament.gameCount).map(game=><section className="tournament-game-editor" key={game.gameNumber}><strong>Map {game.gameNumber}</strong><label>Mode<select value={game.mode} onChange={event=>updateTournamentGame(game.gameNumber,{mode:event.target.value})}>{Array.from(new Set([game.mode,...newsSettings.warzoneGameModes])).filter(Boolean).map(mode=><option key={mode} value={mode}>{mode}</option>)}</select></label><label>Placement {editing.warzoneTournament!.format==='kill_race'&&<small>(optional)</small>}<select value={game.placement??''} onChange={event=>updateTournamentGame(game.gameNumber,{placement:event.target.value?Number(event.target.value):null})}><option value="">Not recorded</option>{Array.from({length:editing.warzoneTournament!.fieldSize},(_,index)=>index+1).map(value=><option key={value} value={value}>{ordinal(value)}</option>)}</select></label><label>Points {editing.warzoneTournament!.format==='kill_race'&&<small>(optional)</small>}<input value={game.points} onChange={event=>updateTournamentGame(game.gameNumber,{points:event.target.value})} placeholder={editing.warzoneTournament!.format==='points'?'Required':'Optional'}/></label><label>Kills <small>{editing.warzoneTournament!.format==='points'?'(optional)':'(required)'}</small><input value={game.kills} onChange={event=>updateTournamentGame(game.gameNumber,{kills:event.target.value})} placeholder={editing.warzoneTournament!.format==='points'?'Optional':'Required'}/></label></section>)}</div>}
     <div className="wide tournament-standings-editor"><div><div className="eyebrow">Overall breakdown</div><h3>Final top 3</h3><p>These are displayed beneath the tournament breakdown. V6 is automatically moved when its overall placement is 1st–3rd.</p></div>{editing.warzoneTournament.standings.map(row=><section key={row.place}><strong>{ordinal(row.place)}</strong><label>Team<input value={row.teamName} onChange={event=>updateStanding(row.place,{teamName:event.target.value})} placeholder={row.place===editing.warzoneTournament!.overallPlacement?'v6':'Team name'}/></label><label>{editing.warzoneTournament!.format==='points'?'Points':'Kills'} <small>(optional)</small><input value={row.score} onChange={event=>updateStanding(row.place,{score:event.target.value})} placeholder="Optional"/></label></section>)}</div>
     <label className="wide">Additional notes <small>(optional)</small><textarea rows={5} value={editing.warzoneTournament.notes} onChange={event=>updateTournament({notes:event.target.value})} placeholder="Any extra tournament context you want shown when the result is opened."/></label>
   </>:<>
     <label className="wide">Headline<input autoFocus value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>Category<input value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/></label><label className="wide">Excerpt<textarea value={editing.excerpt} onChange={e=>setEditing({...editing,excerpt:e.target.value})}/></label><label className="wide">Article body<textarea rows={12} value={editing.body} onChange={e=>setEditing({...editing,body:e.target.value})}/></label><label>Cover image URL<input value={editing.coverImage} onChange={e=>setEditing({...editing,coverImage:e.target.value})}/></label><label>Author<input value={editing.authorName} onChange={e=>setEditing({...editing,authorName:e.target.value})}/></label>
   </>}
   <label>Status<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value as NewsArticle['status']})}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
   <label className="wide">Social / Discord caption <small>{isResult(editing)?'(optional — generated automatically if blank)':''}</small><textarea value={editing.socialCaption} onChange={e=>setEditing({...editing,socialCaption:e.target.value})} placeholder={isResult(editing)?'Leave blank to generate from the result.':'Social caption'}/></label>
   <label className="featured-toggle"><span><strong>Post to Discord</strong><small>Send this post to the configured announcements channel when it publishes.</small></span><input type="checkbox" checked={Boolean(editing.postToDiscord)} disabled={Boolean(editing.discordPostedAt)} onChange={e=>setEditing({...editing,postToDiscord:e.target.checked,discordMention:e.target.checked?(editing.discordMention||'none'):'none'})}/><i/></label>{editing.postToDiscord&&<><label>Discord mention<select value={editing.discordMention||'none'} onChange={e=>setEditing({...editing,discordMention:e.target.value as NewsArticle['discordMention']})}><option value="none">No mention</option>{discordSettings.allowTeam&&<option value="team">@team</option>}{discordSettings.allowEveryone&&<option value="everyone">@everyone</option>}</select></label><div className="wide discord-preview-actions"><button type="button" className="btn btn-secondary" onClick={()=>setDiscordPreview(value=>!value)}>{discordPreview?'Hide Discord preview':'Preview Discord post'}</button>{editing.discordMention==='everyone'&&<strong className="discord-everyone-warning">⚠ @everyone will notify the entire server.</strong>}</div>{discordPreview&&<pre className="wide discord-message-preview">{discordText(editing)}</pre>}</>}
   <label className="featured-toggle"><span><strong>Auto-post to X</strong><small>Stored now; activates when X integration is connected.</small></span><input type="checkbox" checked={editing.autoPostX} onChange={e=>setEditing({...editing,autoPostX:e.target.checked})}/><i/></label>{!isResult(editing)&&<label className="featured-toggle"><span><strong>Featured story</strong><small>Prioritise this article on the News page.</small></span><input type="checkbox" checked={editing.featured} onChange={e=>setEditing({...editing,featured:e.target.checked})}/><i/></label>}
  </div><footer className="recruitment-editor-actions"><button className="btn recruitment-cancel" onClick={()=>setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>{editing.publishedAt&&protectedPost(editing)&&!isSuperUser?'Submit changes for approval':isTournament(editing)?'Save tournament result':isScrim(editing)?'Save scrim result':'Save article'}</button></footer></section></div>}
 </div>
}
