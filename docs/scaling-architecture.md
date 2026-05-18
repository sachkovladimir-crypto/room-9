# ROOM_9 Scaling Architecture

## Current Recommendation

At the MVP stage, ROOM_9 should remain a modular monolith: one integrated Next.js application connected to Supabase Auth, PostgreSQL, and Storage.

This is the correct architecture for the diploma scope because it is:

- faster to develop;
- easier to debug;
- easier to deploy to Vercel;
- easier to explain during defense;
- lower in infrastructure complexity;
- sufficient for the current booking, profile, dashboard, event, stream, and chat flows.

The current app should stay modular internally, but it should not be split into microservices yet.

## Why Not Split Now

Independent services add operational overhead: deployment pipelines, service authentication, logs, monitoring, data ownership, retries, queues, and failure handling. At MVP scale, this complexity would not improve the product. It would mostly slow delivery and make the demo more fragile.

ROOM_9 should only extract a module when that module has independent load, independent security requirements, or special compute/storage needs.

## Future Service Candidates

### Media / Streaming Service

Audio uploads, video streams, archives, thumbnails, encoding, CDN delivery, and storage quotas can grow faster than the booking system. In V3, media can become a separate service connected to CDN and transcoding infrastructure.

### Chat / Realtime Service

Booking chat works inside the MVP database. If chat becomes high-traffic, message delivery, realtime presence, moderation, spam protection, and notification fan-out may require a separate realtime service.

### Recommendation Service

AI recommendations and lineup matching may require embeddings, background jobs, model calls, ranking logic, and separate compute. This can be extracted when recommendation quality becomes a product differentiator.

### Payment Service

Payments and escrow require strong isolation, provider integration, audit logs, compliance rules, refund handling, and strict permissions. This is a strong candidate for future service extraction.

### Analytics Service

Profile views, track plays, event clicks, stream views, booking funnels, and revenue metrics can generate large data volumes. Long-term analytics should move to a warehouse or event pipeline instead of overloading the main transactional database.

## Conclusion

For the diploma/MVP, ROOM_9 should remain a modular monolith.

For V3 marketplace scale, service extraction should be considered only for modules with independent traffic, stronger security boundaries, or specialized compute/storage requirements.
