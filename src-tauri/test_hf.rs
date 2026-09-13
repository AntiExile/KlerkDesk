use hf_hub::{api::sync::ApiBuilder, Repo, RepoType};

fn main() {
    let api = ApiBuilder::new().build().unwrap();
    let repo = api.repo(Repo::new("sentence-transformers/all-MiniLM-L6-v2".to_string(), RepoType::Model));
    println!("URL: {}", repo.url("tokenizer.json"));
}
