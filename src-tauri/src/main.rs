// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    if args.get(1).map(String::as_str) == Some("--delineation-daemon") {
        let Some(project_path) = args.get(2).cloned() else {
            eprintln!("missing project path for --delineation-daemon");
            std::process::exit(2);
        };
        let app_exe = args
            .get(3)
            .map(std::path::PathBuf::from)
            .or_else(|| std::env::current_exe().ok())
            .unwrap_or_else(|| std::path::PathBuf::from(&args[0]));
        if let Err(err) = app_lib::daemon::run(project_path, app_exe) {
            eprintln!("delineation daemon failed: {err}");
            std::process::exit(1);
        }
        return;
    }
    app_lib::run()
}
