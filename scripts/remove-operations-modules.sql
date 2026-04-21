-- DESTRUCTIVE: Drops tables for removed Operations modules (contractor, command centre,
-- access management / routes, rector-related data, tasks, fuel supply, customer diesel).
-- Also removes page role rows for those screens. Run ONLY after backup.
-- Run: npm run db:remove-operations-modules

DELETE FROM user_page_roles
WHERE page_id IN (
  N'contractor',
  N'command_centre',
  N'access_management',
  N'rector',
  N'tasks',
  N'fuel_supply_management',
  N'fuel_customer_orders'
);
GO

/* --- Tasks --- */
IF OBJECT_ID(N'dbo.task_comment_attachments', N'U') IS NOT NULL DROP TABLE dbo.task_comment_attachments;
GO
IF OBJECT_ID(N'dbo.task_reminders', N'U') IS NOT NULL DROP TABLE dbo.task_reminders;
GO
IF OBJECT_ID(N'dbo.task_progress_updates', N'U') IS NOT NULL DROP TABLE dbo.task_progress_updates;
GO
IF OBJECT_ID(N'dbo.task_comments', N'U') IS NOT NULL DROP TABLE dbo.task_comments;
GO
IF OBJECT_ID(N'dbo.task_assignments', N'U') IS NOT NULL DROP TABLE dbo.task_assignments;
GO
IF OBJECT_ID(N'dbo.task_attachments', N'U') IS NOT NULL DROP TABLE dbo.task_attachments;
GO
IF OBJECT_ID(N'dbo.task_labels', N'U') IS NOT NULL DROP TABLE dbo.task_labels;
GO
IF OBJECT_ID(N'dbo.tasks', N'U') IS NOT NULL DROP TABLE dbo.tasks;
GO
IF OBJECT_ID(N'dbo.task_library_files', N'U') IS NOT NULL DROP TABLE dbo.task_library_files;
GO
IF OBJECT_ID(N'dbo.task_library_folders', N'U') IS NOT NULL DROP TABLE dbo.task_library_folders;
GO

/* --- Fuel --- */
IF OBJECT_ID(N'dbo.fuel_trip_stops', N'U') IS NOT NULL DROP TABLE dbo.fuel_trip_stops;
GO
IF OBJECT_ID(N'dbo.fuel_vehicle_trips', N'U') IS NOT NULL DROP TABLE dbo.fuel_vehicle_trips;
GO
IF OBJECT_ID(N'dbo.fuel_delivery_vehicles', N'U') IS NOT NULL DROP TABLE dbo.fuel_delivery_vehicles;
GO
IF OBJECT_ID(N'dbo.fuel_reconciliations', N'U') IS NOT NULL DROP TABLE dbo.fuel_reconciliations;
GO
IF OBJECT_ID(N'dbo.fuel_deliveries', N'U') IS NOT NULL DROP TABLE dbo.fuel_deliveries;
GO
IF OBJECT_ID(N'dbo.fuel_supply_activities', N'U') IS NOT NULL DROP TABLE dbo.fuel_supply_activities;
GO
IF OBJECT_ID(N'dbo.fuel_diesel_orders', N'U') IS NOT NULL DROP TABLE dbo.fuel_diesel_orders;
GO
IF OBJECT_ID(N'dbo.fuel_supply_events', N'U') IS NOT NULL DROP TABLE dbo.fuel_supply_events;
GO
IF OBJECT_ID(N'dbo.fuel_supply_grants', N'U') IS NOT NULL DROP TABLE dbo.fuel_supply_grants;
GO
IF OBJECT_ID(N'dbo.fuel_customer_diesel_requests', N'U') IS NOT NULL DROP TABLE dbo.fuel_customer_diesel_requests;
GO

/* --- Command Centre & related --- */
IF OBJECT_ID(N'dbo.compliance_response_attachments', N'U') IS NOT NULL DROP TABLE dbo.compliance_response_attachments;
GO
IF OBJECT_ID(N'dbo.cc_fleet_application_comments', N'U') IS NOT NULL DROP TABLE dbo.cc_fleet_application_comments;
GO
IF OBJECT_ID(N'dbo.cc_fleet_republish_bot_log', N'U') IS NOT NULL DROP TABLE dbo.cc_fleet_republish_bot_log;
GO
IF OBJECT_ID(N'dbo.cc_compliance_inspections', N'U') IS NOT NULL DROP TABLE dbo.cc_compliance_inspections;
GO
IF OBJECT_ID(N'dbo.cc_fleet_applications', N'U') IS NOT NULL DROP TABLE dbo.cc_fleet_applications;
GO
IF OBJECT_ID(N'dbo.shift_report_override_requests', N'U') IS NOT NULL DROP TABLE dbo.shift_report_override_requests;
GO
IF OBJECT_ID(N'dbo.controller_evaluations', N'U') IS NOT NULL DROP TABLE dbo.controller_evaluations;
GO
IF OBJECT_ID(N'dbo.command_centre_shift_report_comments', N'U') IS NOT NULL DROP TABLE dbo.command_centre_shift_report_comments;
GO
IF OBJECT_ID(N'dbo.command_centre_shift_reports', N'U') IS NOT NULL DROP TABLE dbo.command_centre_shift_reports;
GO
IF OBJECT_ID(N'dbo.command_centre_investigation_reports', N'U') IS NOT NULL DROP TABLE dbo.command_centre_investigation_reports;
GO
IF OBJECT_ID(N'dbo.command_centre_library_documents', N'U') IS NOT NULL DROP TABLE dbo.command_centre_library_documents;
GO
IF OBJECT_ID(N'dbo.cc_notes_reminders', N'U') IS NOT NULL DROP TABLE dbo.cc_notes_reminders;
GO
IF OBJECT_ID(N'dbo.command_centre_grants', N'U') IS NOT NULL DROP TABLE dbo.command_centre_grants;
GO
IF OBJECT_ID(N'dbo.truck_analysis_handovers', N'U') IS NOT NULL DROP TABLE dbo.truck_analysis_handovers;
GO

/* --- AM / Rector project tables (route FK to contractor_routes) --- */
IF OBJECT_ID(N'dbo.project_progress_report_routes', N'U') IS NOT NULL DROP TABLE dbo.project_progress_report_routes;
GO
IF OBJECT_ID(N'dbo.project_progress_reports', N'U') IS NOT NULL DROP TABLE dbo.project_progress_reports;
GO
IF OBJECT_ID(N'dbo.project_action_plan_routes', N'U') IS NOT NULL DROP TABLE dbo.project_action_plan_routes;
GO
IF OBJECT_ID(N'dbo.project_action_plans', N'U') IS NOT NULL DROP TABLE dbo.project_action_plans;
GO
IF OBJECT_ID(N'dbo.monthly_performance_report_routes', N'U') IS NOT NULL DROP TABLE dbo.monthly_performance_report_routes;
GO
IF OBJECT_ID(N'dbo.monthly_performance_reports', N'U') IS NOT NULL DROP TABLE dbo.monthly_performance_reports;
GO

/* --- Access management distribution --- */
IF OBJECT_ID(N'dbo.access_route_factors', N'U') IS NOT NULL DROP TABLE dbo.access_route_factors;
GO
IF OBJECT_ID(N'dbo.pilot_list_distribution', N'U') IS NOT NULL DROP TABLE dbo.pilot_list_distribution;
GO
IF OBJECT_ID(N'dbo.access_distribution_history', N'U') IS NOT NULL DROP TABLE dbo.access_distribution_history;
GO

/* --- Contractor fleet --- */
IF OBJECT_ID(N'dbo.contractor_message_attachments', N'U') IS NOT NULL DROP TABLE dbo.contractor_message_attachments;
GO
IF OBJECT_ID(N'dbo.contractor_messages', N'U') IS NOT NULL DROP TABLE dbo.contractor_messages;
GO
IF OBJECT_ID(N'dbo.contractor_suspensions', N'U') IS NOT NULL DROP TABLE dbo.contractor_suspensions;
GO
IF OBJECT_ID(N'dbo.contractor_incidents', N'U') IS NOT NULL DROP TABLE dbo.contractor_incidents;
GO
IF OBJECT_ID(N'dbo.contractor_expiries', N'U') IS NOT NULL DROP TABLE dbo.contractor_expiries;
GO
IF OBJECT_ID(N'dbo.contractor_route_drivers', N'U') IS NOT NULL DROP TABLE dbo.contractor_route_drivers;
GO
IF OBJECT_ID(N'dbo.contractor_route_trucks', N'U') IS NOT NULL DROP TABLE dbo.contractor_route_trucks;
GO
IF OBJECT_ID(N'dbo.contractor_routes', N'U') IS NOT NULL DROP TABLE dbo.contractor_routes;
GO
IF OBJECT_ID(N'dbo.contractor_library_documents', N'U') IS NOT NULL DROP TABLE dbo.contractor_library_documents;
GO
IF OBJECT_ID(N'dbo.contractor_subcontractors', N'U') IS NOT NULL DROP TABLE dbo.contractor_subcontractors;
GO
IF OBJECT_ID(N'dbo.contractor_info', N'U') IS NOT NULL DROP TABLE dbo.contractor_info;
GO
IF OBJECT_ID(N'dbo.contractor_trucks', N'U') IS NOT NULL DROP TABLE dbo.contractor_trucks;
GO
IF OBJECT_ID(N'dbo.contractor_drivers', N'U') IS NOT NULL DROP TABLE dbo.contractor_drivers;
GO
IF OBJECT_ID(N'dbo.user_contractors', N'U') IS NOT NULL DROP TABLE dbo.user_contractors;
GO
IF OBJECT_ID(N'dbo.contractors', N'U') IS NOT NULL DROP TABLE dbo.contractors;
GO
