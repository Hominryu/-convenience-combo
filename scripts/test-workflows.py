from pathlib import Path
import re
import unittest


class WorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        root = Path(__file__).resolve().parents[1]
        self.promotion = (root / ".github/workflows/crawler.yml").read_text(encoding="utf-8")
        self.general = (root / ".github/workflows/general-products.yml").read_text(encoding="utf-8")

    def test_production_and_compatible_supabase_configuration(self) -> None:
        for workflow in (self.promotion, self.general):
            self.assertIn("environment: Production", workflow)
            self.assertIn("vars.SUPABASE_URL || secrets.SUPABASE_URL", workflow)
            self.assertIn("secrets.SUPABASE_SERVICE_ROLE_KEY", workflow)
            self.assertNotRegex(workflow, r"echo.*\$SUPABASE_(?:URL|SERVICE_ROLE_KEY)")

    def test_promotion_schedule_is_unchanged(self) -> None:
        self.assertIn('cron: "0 17 * * *"', self.promotion)
        self.assertIn("python crawler/run.py", self.promotion)

    def test_general_workflow_is_independent(self) -> None:
        self.assertIn("workflow_dispatch:", self.general)
        self.assertIn("python crawler/run_general.py", self.general)
        self.assertNotIn("crawler/run.py --retailer", self.general)


if __name__ == "__main__":
    unittest.main()
