// macOS fullscreen completion is asynchronous. Do not use the requested
// fullscreen flag as proof that the native Space transition has finished.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Phase {
    #[default]
    Windowed,
    Entering,
    Fullscreen,
    Exiting,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    Wait,
    ExitFullscreen,
    Hide,
}

#[derive(Default)]
pub struct CloseState {
    pub phase: Phase,
    next_ticket: u64,
    pending: Option<u64>,
}

impl CloseState {
    pub fn begin(&mut self) -> Result<u64, &'static str> {
        if self.pending.is_some() {
            return Err("窗口正在关闭，请稍候。");
        }
        self.next_ticket = self.next_ticket.wrapping_add(1);
        self.pending = Some(self.next_ticket);
        Ok(self.next_ticket)
    }
    pub fn pending(&self) -> Option<u64> {
        self.pending
    }
    pub fn transition(&mut self, phase: Phase) -> Option<u64> {
        self.phase = phase;
        self.pending
    }
    pub fn action(&mut self, ticket: u64) -> Action {
        if self.pending != Some(ticket) {
            return Action::Wait;
        }
        match self.phase {
            Phase::Windowed => Action::Hide,
            Phase::Fullscreen => {
                self.phase = Phase::Exiting;
                Action::ExitFullscreen
            }
            Phase::Entering | Phase::Exiting => Action::Wait,
        }
    }
    pub fn finish(&mut self, ticket: u64) -> bool {
        if self.pending != Some(ticket) {
            return false;
        }
        self.pending = None;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn waits_for_native_exit_even_if_the_requested_flag_was_already_cleared() {
        let mut state = CloseState {
            phase: Phase::Fullscreen,
            ..Default::default()
        };
        let id = state.begin().unwrap();
        assert_eq!(state.action(id), Action::ExitFullscreen);
        assert_eq!(state.action(id), Action::Wait);
        assert!(state.begin().is_err());
        state.transition(Phase::Exiting);
        assert_eq!(state.action(id), Action::Wait);
        state.transition(Phase::Windowed);
        assert_eq!(state.action(id), Action::Hide);
        assert!(state.finish(id));
        assert_eq!(state.action(id), Action::Wait);
    }
    #[test]
    fn closing_during_entry_first_waits_for_entry_then_exits() {
        let mut state = CloseState {
            phase: Phase::Entering,
            ..Default::default()
        };
        let id = state.begin().unwrap();
        assert_eq!(state.action(id), Action::Wait);
        state.transition(Phase::Fullscreen);
        assert_eq!(state.action(id), Action::ExitFullscreen);
        state.transition(Phase::Windowed);
        assert_eq!(state.action(id), Action::Hide);
    }
    #[test]
    fn reopen_or_timeout_invalidates_deferred_hide_and_old_completions() {
        let mut state = CloseState {
            phase: Phase::Exiting,
            ..Default::default()
        };
        let old = state.begin().unwrap();
        assert_eq!(state.action(old), Action::Wait);
        assert!(state.finish(old));
        state.transition(Phase::Windowed);
        assert_eq!(state.action(old), Action::Wait);
        let new = state.begin().unwrap();
        assert!(!state.finish(old));
        assert_eq!(state.action(old), Action::Wait);
        assert_eq!(state.action(new), Action::Hide);
        assert_eq!(state.pending(), Some(new));
    }
    #[test]
    fn ordinary_window_closes_without_a_fullscreen_transition() {
        let mut state = CloseState::default();
        let id = state.begin().unwrap();
        assert_eq!(state.action(id), Action::Hide);
        state.finish(id);
        assert_eq!(state.pending(), None);
    }
}
