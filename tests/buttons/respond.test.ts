import { describe, expect, it } from 'vitest';
import { handleClose } from '../../src/buttons/close.ts';
import { handleRespond } from '../../src/buttons/respond.ts';
import {
  createFakeButtonInteraction,
  createTestContext,
  type TestContext,
} from '../helpers/fakes.ts';

const seedPickup = (context: TestContext, creatorId = 'creator-1'): number => {
  context.settings.setPickupChannel('guild-1', 'channel-1');
  context.settings.setMentionRole('guild-1', 'role-1');
  const id = context.pickups.create({
    guildId: 'guild-1',
    channelId: 'channel-1',
    creatorId,
    startsAt: null,
    startsAtText: null,
    note: null,
  });
  context.pickups.attachMessage(id, 'message-1');
  return id;
};

const labelsOf = (payload: unknown): string[] => {
  const components = (payload as { components: { toJSON(): { components: unknown[] } }[] })
    .components;
  return components[0]
    ? components[0]
        .toJSON()
        .components.slice(0, 3)
        .map((component) =>
          typeof component === 'object' && component !== null && 'label' in component
            ? String((component as { label: unknown }).label)
            : '',
        )
    : [];
};

describe('handleRespond', () => {
  it('records a response and re-renders with the new tally', async () => {
    const context = createTestContext();
    const id = seedPickup(context);
    const fake = createFakeButtonInteraction({ userId: 'u1' });

    await handleRespond(
      fake.interaction,
      { action: 'respond', choice: 'in', pickupId: id },
      context,
    );

    expect(context.responses.listByPickup(id)).toHaveLength(1);
    expect(labelsOf(fake.editedWith())).toEqual(['Dabei · 1', 'Später · 0', 'Raus · 0']);
    expect(fake.calls[0]?.method).toBe('deferUpdate');
  });

  it('removes the response when the same choice is clicked twice', async () => {
    const context = createTestContext();
    const id = seedPickup(context);

    for (const _ of [0, 1]) {
      const fake = createFakeButtonInteraction({ userId: 'u1' });
      await handleRespond(
        fake.interaction,
        { action: 'respond', choice: 'in', pickupId: id },
        context,
      );
    }

    expect(context.responses.listByPickup(id)).toEqual([]);
  });

  it('switches a response without duplicating it', async () => {
    const context = createTestContext();
    const id = seedPickup(context);

    const first = createFakeButtonInteraction({ userId: 'u1' });
    await handleRespond(
      first.interaction,
      { action: 'respond', choice: 'in', pickupId: id },
      context,
    );
    const second = createFakeButtonInteraction({ userId: 'u1' });
    await handleRespond(
      second.interaction,
      { action: 'respond', choice: 'later', pickupId: id },
      context,
    );

    const stored = context.responses.listByPickup(id);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.choice).toBe('later');
    expect(labelsOf(second.editedWith())).toEqual(['Dabei · 0', 'Später · 1', 'Raus · 0']);
  });

  it('keeps separate users independent', async () => {
    const context = createTestContext();
    const id = seedPickup(context);

    for (const userId of ['u1', 'u2', 'u3']) {
      const fake = createFakeButtonInteraction({ userId });
      await handleRespond(
        fake.interaction,
        { action: 'respond', choice: 'in', pickupId: id },
        context,
      );
    }

    expect(context.responses.listByPickup(id)).toHaveLength(3);
  });

  it('serialises concurrent clicks on the same pickup', async () => {
    const context = createTestContext();
    const id = seedPickup(context);

    await Promise.all(
      ['u1', 'u2', 'u3', 'u4'].map((userId) => {
        const fake = createFakeButtonInteraction({ userId });
        return handleRespond(
          fake.interaction,
          { action: 'respond', choice: 'in', pickupId: id },
          context,
        );
      }),
    );

    expect(context.responses.listByPickup(id)).toHaveLength(4);
  });

  it('reports a missing pickup', async () => {
    const context = createTestContext();
    const fake = createFakeButtonInteraction({ userId: 'u1' });

    await handleRespond(
      fake.interaction,
      { action: 'respond', choice: 'in', pickupId: 999 },
      context,
    );

    expect(fake.ephemeralMessages().join(' ')).toContain('existiert nicht mehr');
  });

  it('refuses to record on a closed pickup and repairs the message', async () => {
    const context = createTestContext();
    const id = seedPickup(context);
    context.pickups.close(id, Date.now());

    const fake = createFakeButtonInteraction({ userId: 'u1' });
    await handleRespond(
      fake.interaction,
      { action: 'respond', choice: 'in', pickupId: id },
      context,
    );

    expect(context.responses.listByPickup(id)).toEqual([]);
    expect(fake.ephemeralMessages().join(' ')).toContain('bereits geschlossen');
  });

  it('resolves state from storage, so it survives a restart', async () => {
    const first = createTestContext();
    const id = seedPickup(first);
    const fake = createFakeButtonInteraction({ userId: 'u1' });
    await handleRespond(fake.interaction, { action: 'respond', choice: 'in', pickupId: id }, first);

    const reopened = { ...first, mutex: createTestContext().mutex };
    const second = createFakeButtonInteraction({ userId: 'u2' });
    await handleRespond(
      second.interaction,
      { action: 'respond', choice: 'in', pickupId: id },
      reopened,
    );

    expect(labelsOf(second.editedWith())[0]).toBe('Dabei · 2');
  });
});

describe('handleClose', () => {
  it('lets the creator close and disables the buttons', async () => {
    const context = createTestContext();
    const id = seedPickup(context, 'creator-1');
    const fake = createFakeButtonInteraction({ userId: 'creator-1' });

    await handleClose(fake.interaction, { action: 'close', pickupId: id }, context);

    expect(context.pickups.findById(id)?.status).toBe('closed');
    const payload = fake.editedWith() as { components: { toJSON(): { components: unknown[] } }[] };
    const disabled = payload.components
      .flatMap((row) => row.toJSON().components)
      .map((component) =>
        typeof component === 'object' && component !== null && 'disabled' in component
          ? (component as { disabled: unknown }).disabled
          : undefined,
      );
    expect(disabled).toEqual([true, true, true, true]);
  });

  it('lets an admin close someone elses pickup', async () => {
    const context = createTestContext();
    const id = seedPickup(context, 'creator-1');
    const fake = createFakeButtonInteraction({ userId: 'admin-1', manageGuild: true });

    await handleClose(fake.interaction, { action: 'close', pickupId: id }, context);

    expect(context.pickups.findById(id)?.status).toBe('closed');
  });

  it('refuses a bystander', async () => {
    const context = createTestContext();
    const id = seedPickup(context, 'creator-1');
    const fake = createFakeButtonInteraction({ userId: 'nobody' });

    await handleClose(fake.interaction, { action: 'close', pickupId: id }, context);

    expect(context.pickups.findById(id)?.status).toBe('open');
    expect(fake.ephemeralMessages().join(' ')).toContain('Nur der Ersteller');
  });

  it('reports an already closed pickup', async () => {
    const context = createTestContext();
    const id = seedPickup(context, 'creator-1');
    context.pickups.close(id, Date.now());

    const fake = createFakeButtonInteraction({ userId: 'creator-1' });
    await handleClose(fake.interaction, { action: 'close', pickupId: id }, context);

    expect(fake.ephemeralMessages().join(' ')).toContain('bereits geschlossen');
  });

  it('reports a missing pickup', async () => {
    const context = createTestContext();
    const fake = createFakeButtonInteraction({ userId: 'creator-1' });

    await handleClose(fake.interaction, { action: 'close', pickupId: 404 }, context);

    expect(fake.ephemeralMessages().join(' ')).toContain('existiert nicht mehr');
  });

  it('drops the role mention once closed', async () => {
    const context = createTestContext();
    const id = seedPickup(context, 'creator-1');
    const fake = createFakeButtonInteraction({ userId: 'creator-1' });

    await handleClose(fake.interaction, { action: 'close', pickupId: id }, context);

    expect((fake.editedWith() as { content: string }).content).toBe('');
  });
});
