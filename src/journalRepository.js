import { supabase } from './supabase.js';

const mapTask = (row) => ({
  id: row.id, title: row.title, dueDate: row.due_date, status: row.status,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const mapPlan = (row) => ({
  id: row.id, taskId: row.task_id, journalDate: row.journal_date,
  scheduledHour: row.scheduled_hour, titleSnapshot: row.title_snapshot,
  status: row.status, createdAt: row.created_at, cancelledAt: row.cancelled_at,
});

const mapExecution = (row) => ({
  id: row.id, taskId: row.task_id, planId: row.plan_id,
  journalDate: row.journal_date, executedAt: row.executed_at,
  titleSnapshot: row.title_snapshot, source: row.source, status: row.status,
  createdAt: row.created_at, voidedAt: row.voided_at,
});

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function fetchJournal(userId, journalDate) {
  const [tasksResult, plansResult, executionsResult] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', userId).neq('status', 'archived').order('created_at', { ascending: false }),
    supabase.from('plans').select('*').eq('user_id', userId).eq('journal_date', journalDate).order('scheduled_hour'),
    supabase.from('executions').select('*').eq('user_id', userId).eq('journal_date', journalDate).order('executed_at'),
  ]);
  return {
    tasks: unwrap(tasksResult).map(mapTask),
    plans: unwrap(plansResult).map(mapPlan),
    executions: unwrap(executionsResult).map(mapExecution),
  };
}

export async function insertTask(userId, task) {
  const data = unwrap(await supabase.from('tasks').insert({
    user_id: userId, title: task.title, due_date: task.dueDate,
  }).select().single());
  return mapTask(data);
}

export async function updateTask(taskId, changes) {
  const payload = {};
  if ('title' in changes) payload.title = changes.title;
  if ('dueDate' in changes) payload.due_date = changes.dueDate;
  if ('status' in changes) payload.status = changes.status;
  return mapTask(unwrap(await supabase.from('tasks').update(payload).eq('id', taskId).select().single()));
}

export async function insertPlan(userId, plan) {
  const data = unwrap(await supabase.from('plans').insert({
    user_id: userId, task_id: plan.taskId, journal_date: plan.journalDate,
    scheduled_hour: plan.scheduledHour, title_snapshot: plan.titleSnapshot,
  }).select().single());
  return mapPlan(data);
}

export async function cancelPlan(planId) {
  return mapPlan(unwrap(await supabase.from('plans').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(),
  }).eq('id', planId).select().single()));
}

export async function insertExecution(userId, execution) {
  const data = unwrap(await supabase.from('executions').insert({
    user_id: userId, task_id: execution.taskId, plan_id: execution.planId,
    journal_date: execution.journalDate, executed_at: execution.executedAt,
    title_snapshot: execution.titleSnapshot, source: execution.source,
  }).select().single());
  return mapExecution(data);
}

export async function voidExecution(executionId) {
  return mapExecution(unwrap(await supabase.from('executions').update({
    status: 'voided', voided_at: new Date().toISOString(),
  }).eq('id', executionId).select().single()));
}

export async function hasRecordedExecution(taskId) {
  const result = await supabase.from('executions')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId)
    .eq('status', 'recorded');
  if (result.error) throw result.error;
  return (result.count || 0) > 0;
}
